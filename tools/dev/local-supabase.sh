#!/usr/bin/env bash
# `pnpm dev:local`: the real app on this machine, cut off from the hosted project. Starts a local
# Supabase (Docker) with our migrations, serves /api, points the cron jobs at it, builds the web app
# against it with local (anonymous) sign-in and serves it at http://127.0.0.1:5005 until Ctrl+C.
# The database keeps its data between runs; `pnpm dev:local:stop` stops it (`-- --no-backup` wipes).
#
# /api settings: supabase/e2e.env (fake AI). For the real DeepSeek, copy it to
# supabase/.env.dev.local (gitignored), drop MONEYTRACE_AI=fake and put your key there yourself.
set -euo pipefail
cd "$(dirname "$0")/../.."
SUPABASE="pnpm dlx supabase@2.122.0"
ENV_FILE=supabase/e2e.env
[ -f supabase/.env.dev.local ] && ENV_FILE=supabase/.env.dev.local
echo "/api settings: $ENV_FILE"

# `start` loads /api too, so its bundle must exist first.
pnpm build:supabase
$SUPABASE start -x imgproxy,logflare,vector
eval "$($SUPABASE status -o env | grep -E '^(API_URL|ANON_KEY|DB_URL)=')"

# The jobs migration reads /api's address and the cron secret from Vault (runbook §2 on the
# hosted project). Inside Docker, /api is behind the local gateway container.
CRON_SECRET_VALUE=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2-)
docker exec -i supabase_db_moneytrace psql -q -U postgres -v ON_ERROR_STOP=1 \
  -v api_url="http://supabase_kong_moneytrace:8000/functions/v1/api" -v cron="$CRON_SECRET_VALUE" <<'SQL'
delete from vault.secrets where name in ('api_url', 'cron_secret');
select vault.create_secret(:'api_url', 'api_url');
select vault.create_secret(:'cron', 'cron_secret');
SQL

$SUPABASE functions serve api --env-file "$ENV_FILE" --no-verify-jwt > supabase-functions.log 2>&1 &
SERVE_PID=$!
trap 'kill $SERVE_PID 2>/dev/null || true' EXIT
code=000
for _ in $(seq 1 90); do
  # /api answers a bodyless POST with 400 once it is up; the gateway answers 5xx before that.
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/functions/v1/api" || true)
  { [ "$code" = "400" ] || [ "$code" = "401" ]; } && break
  sleep 2
done
echo "/api answered $code (log: supabase-functions.log)"

NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" NEXT_PUBLIC_LOCAL_SIGN_IN=1 \
  pnpm --filter web build

cat <<EOF

  MoneyTrace (local):   http://127.0.0.1:5005   (use 127.0.0.1, not localhost: /api only allows that origin)
  Supabase Studio:      http://127.0.0.1:54323  (browse the docs table)
  Ctrl+C stops the site and /api; the database keeps running (pnpm dev:local:stop).

EOF
pnpm serve:web
