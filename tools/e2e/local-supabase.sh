#!/usr/bin/env bash
# CR-010 browser suite on a local Supabase (needs Docker): starts the stack with our migrations,
# serves /api with the fake AI, builds the web app against it with local (anonymous) sign-in, then
# runs Playwright, which serves the build like Cloudflare Pages (tools/serve-web).
set -euo pipefail
cd "$(dirname "$0")/../.."
SUPABASE="pnpm dlx supabase@2.122.0"

$SUPABASE start -x studio,imgproxy,logflare,vector
eval "$($SUPABASE status -o env | grep -E '^(API_URL|ANON_KEY)=')"

pnpm build:supabase
$SUPABASE functions serve api --env-file supabase/e2e.env --no-verify-jwt > supabase-functions.log 2>&1 &
SERVE_PID=$!
trap 'kill $SERVE_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 90); do
  # /api answers a bodyless POST with 400 once it is up; the gateway answers 5xx before that.
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/functions/v1/api" || true)
  [ "$code" = "400" ] || [ "$code" = "401" ] && break
  sleep 2
done
echo "/api answered $code"

NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" NEXT_PUBLIC_LOCAL_SIGN_IN=1 \
  pnpm --filter web build
pnpm exec playwright test --config=e2e/playwright.config.ts
