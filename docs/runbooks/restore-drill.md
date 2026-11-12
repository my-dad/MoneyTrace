# Firestore restore drill

This drill checks that a restored Firestore database contains every registered
owner collection, the user profile, and the deletion log, and that ledger
balances still equal the sum of restored ledger entries.

The checksum source is `OWNER_DATA_REGISTRY`; it does not contain a second
hand-written collection list.

## Local validation

```bash
pnpm test:emulator
```

The emulator tests seed a contract-valid document in every registered owner
collection and verify that deleting or changing any document changes only that
collection's checksum, including profile and deletion-log loss. They also run
the drill's own `seed` and `verify` end to end, and check that a lost ledger
entry or a wrong balance is reported.

## Before a staging drill (0B only)

A staging drill needs managed backups, and backups need the Blaze plan. Until
Mabrur approves Blaze under the 0B gate (`firebase-environments.md`), stop here.
Once Blaze is approved, set backups and point-in-time recovery up once.

Backup retention is configurable. The default is `backupDays` in the retention
policy (`packages/contracts/src/retention-policy.ts`, currently 14 days).
Override it for one run with `BACKUP_RETENTION_DAYS`, a whole number of days
from 1 to 98 (Firestore keeps scheduled backups for at most 14 weeks). Change
the policy default instead when the period changes for good, because the user
is told how long backups are kept (PRD section 10).

```bash
pnpm -s backups:retention                             # prints the value used, e.g. 14d
# BACKUP_RETENTION_DAYS=30 pnpm -s backups:retention  # one-off override
firebase firestore:backups:schedules:create --project moneytrace-staging \
  --database "(default)" --recurrence DAILY \
  --retention "$(pnpm -s backups:retention)"
firebase firestore:databases:update "(default)" --project moneytrace-staging \
  --point-in-time-recovery ENABLED
```

Record the retention used in `restore-drill-log.md`.

The tool refuses any project other than `demo-moneytrace` or one ending in
`-staging`. A staging run refuses to start while `FIRESTORE_EMULATOR_HOST` is
set, so it can never silently drill the emulator instead. Run
`unset FIRESTORE_EMULATOR_HOST` first.

## Seed staging

```bash
gcloud auth application-default login
unset FIRESTORE_EMULATOR_HOST
pnpm drill:seed --project moneytrace-staging --expected /tmp/drill-expected.json
```

The seed creates the fixed owner `restore-drill` (it has no Auth user), posts
an opening balance through the application use case, validates the remaining
seed documents against their contract schemas, and writes counts plus SHA-256
hashes to the expected file. The seeded source event is already terminal, so
deployed triggers and schedules leave it alone. The expected file contains no
raw financial documents; keep it outside the repository.

## Back up, restore and verify

The backup must be taken **after** the seed and before anything else changes
the `restore-drill` owner or the `deletionLog` collection (its whole content is
hashed). Do not wait for an older daily backup: note the seed time, then wait
for the next scheduled backup, and check that its snapshot time is later.

```bash
firebase firestore:backups:list --project moneytrace-staging
# Use the "name" of a backup whose snapshot time is after the seed.
firebase firestore:databases:restore --project moneytrace-staging \
  --backup <backup-name> --database restore-drill
pnpm drill:verify --project moneytrace-staging \
  --database restore-drill --expected /tmp/drill-expected.json
```

`verify` on staging requires `--database` and refuses `(default)`, because
checking the live database would compare it with itself. A pass prints
`checksum match in moneytrace-staging/restore-drill`. Any difference names a
registered collection, `profile`, `deletionLog`, or `balance:<accountId>` and
exits non-zero. Record the result, with the backup name and both timestamps, in
`restore-drill-log.md`.

## Clean up

```bash
firebase firestore:databases:delete restore-drill --project moneytrace-staging
rm /tmp/drill-expected.json
```

Then delete the seeded data from the live database: the `users/restore-drill`
document with all its subcollections, and `deletionLog/restore-drill`. Use the
Firebase console, or `firebase firestore:delete users/restore-drill --recursive
--project moneytrace-staging` and `firebase firestore:delete
deletionLog/restore-drill --project moneytrace-staging`.

## Not covered by this drill

Firestore backups do not include Auth or Storage. For Auth, export it outside
the repository and check that the expected real user accounts are present, then
delete the export, because it contains user data:

```bash
firebase auth:export /tmp/auth-export.json --project moneytrace-staging
rm /tmp/auth-export.json
```

Storage is intentionally not restored: an orphaned `temporaryUploads` record
must ask for a new upload, according to the pipeline spec. Replaying the
deletion log after a restore (so deleted accounts stay deleted) is Phase 4 work
and is not exercised yet.
