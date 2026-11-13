# Restore drill (CR-010)

Backups: `.github/workflows/backup.yml` runs nightly (and on demand). It dumps the `docs`
table's data with `pg_dump` 17 and counts rows per collection (the manifest), encrypts both with
`age` to `BACKUP_AGE_PUBLIC_KEY`, and keeps them as a workflow artifact for 14 days. The
repository is public, so nothing unencrypted ever leaves the database. The private key stays
offline with Mabrur. The run also keeps a free Supabase project from pausing when idle.

## Drill

1. GitHub → Actions → Nightly backup → Run workflow; download the artifact.
2. On Mabrur's machine:

   ```bash
   node tools/backup/backup.mjs drill docs.sql.age ~/moneytrace-backup.key manifest.json.age
   ```

3. It restores the dump into an in-process Postgres built from the real migration, then checks
   that every collection's row count matches the manifest and that `tools/backup/ledger-check.sql`
   finds no problem (balanced entries, balances equal to their entries). It must print
   `restore drill: PASS`.

A failed drill blocks invites (release checklist D5) until it passes.

## Restoring for real

Into an empty project after `supabase db push`:

```bash
node tools/backup/backup.mjs decrypt docs.sql.age ~/moneytrace-backup.key docs.sql
psql "$SUPABASE_DB_URL" -f docs.sql && rm docs.sql
```

The decrypted file is real financial data: it is written readable only by you, never over an
existing file, and deleted after the restore. At most
one day of data can be lost: the free plan has no point-in-time recovery (CR-010).
