# Going live on Supabase (CR-010) — Mabrur's runbook

No billing account anywhere. Keys and passwords go straight into the dashboards or your terminal,
never into chat. `<ref>` is your Supabase project ref (the `xxxx` in `https://xxxx.supabase.co`).
`<site>` is your Cloudflare Pages address (for example `https://moneytrace.pages.dev`).

## 1. Accounts (about 1 hour)

1. **Supabase project.** supabase.com → New project → name `moneytrace`, region **South Asia
   (Mumbai)**, a strong database password (keep it in your password manager).
2. **Google sign-in.**
   - Google Cloud Console (no billing needed) → APIs & Services → OAuth consent screen →
     External, app name MoneyTrace, your support email.
   - Credentials → Create credentials → OAuth client ID → Web application. Authorized redirect URI:
     `https://<ref>.supabase.co/auth/v1/callback`.
   - Supabase → Authentication → Sign In / Providers → Google → enable, paste the client ID and
     secret.
3. **Cloudflare Pages.** dash.cloudflare.com → Workers & Pages → Create → Pages → connect the GitHub
   repo, production branch `master`.
   - Build command: `npm install -g corepack@0.34.6 && corepack enable && pnpm install --frozen-lockfile && pnpm --filter web build`
   - Output directory: `apps/web/out`
   - Environment variables: `NODE_VERSION=22.23.1`, `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>` (Supabase → Project Settings → API keys; the
     anon key is public by design).
4. **Sign-in addresses.** Supabase → Authentication → URL Configuration: Site URL `<site>`; Redirect
   URLs add `<site>`.
5. **Backup key.** In the repo: `node tools/backup/backup.mjs keygen ~/moneytrace-backup.key`.
   It prints a public key (`age1…`). Keep the key file offline (password manager or USB). Losing it
   means the backups can't be read.
6. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - `BACKUP_AGE_PUBLIC_KEY` = the `age1…` line.
   - `SUPABASE_DB_URL` = Supabase → Connect → **Session pooler** connection string, with your
     database password filled in.
7. **DeepSeek.** Read DeepSeek's data-processing terms first (unclear SMS text goes to them). Then
   create an API key and keep it ready for step 2 below.

## 2. Link the project and set secrets (10 minutes)

```bash
pnpm dlx supabase@2.122.0 login
pnpm dlx supabase@2.122.0 link --project-ref <ref>
CRON=$(openssl rand -hex 32)
pnpm dlx supabase@2.122.0 secrets set CRON_SECRET="$CRON" ALLOWED_ORIGINS=<site> OWNER_EMAIL=<your gmail>
pnpm dlx supabase@2.122.0 secrets set DEEPSEEK_API_KEY=<key>   # typed here, never in chat
echo "$CRON"   # copy it for the next step, then clear your terminal
```

Supabase → SQL Editor → run (with your values):

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/api', 'api_url');
select vault.create_secret('<the CRON value>', 'cron_secret');
```

## 3. Deploy (5 minutes)

```bash
pnpm deploy:supabase
```

It refuses to run if a secret is missing. It applies the database migrations (table, read policy,
scheduled jobs, live updates) and deploys `/api`. The web app deploys itself when `master` changes.

## 4. Go-live checks (together)

1. Open `<site>` on your phone → the data notice shows → sign in with Google.
2. Paste one real SMS from each of your banks → each posts correctly.
3. Paste an unclear SMS → it goes through DeepSeek. Then we block DeepSeek and check that it waits
   in the pending list instead.
4. Count your cash and Adjust once.
5. Install the app to your home screen.
6. **Restore drill:** GitHub → Actions → Nightly backup → Run workflow. Download the artifact, then:
   `node tools/backup/backup.mjs drill docs.sql.age ~/moneytrace-backup.key manifest.json.age` →
   it must say `restore drill: PASS`.

All six pass → invite friends and family. Any one fails → no invites until it's fixed.
