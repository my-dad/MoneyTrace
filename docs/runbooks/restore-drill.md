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

The emulator test seeds a contract-valid document in every registered owner
collection and verifies that deleting or changing any document changes only
that collection's checksum. It also checks profile and deletion-log loss.

## Seed a real staging database

This requires Application Default Credentials and an existing staging project.
The command refuses projects unless the ID is `demo-moneytrace` or ends in
`-staging`.

```bash
gcloud auth application-default login
pnpm drill:seed --project moneytrace-staging --expected drill-expected.json
```

The seed creates the fixed owner `restore-drill`, posts an opening balance
through the application use case, validates the remaining seed documents
against their contract schemas, and writes counts plus SHA-256 hashes to the
expected file. The expected file contains no raw financial documents and must
not be committed.

## Restore and verify

After a daily Firestore backup exists, restore it into a temporary database
named `restore-drill` using the Firebase CLI. Check the current CLI flags first:

```bash
firebase firestore:databases:restore --help
pnpm firebase firestore:databases:restore <backup-resource> \
  --database restore-drill --project moneytrace-staging
pnpm drill:verify --project moneytrace-staging \
  --database restore-drill --expected drill-expected.json
```

Expected output is `checksum match`. Any difference names a registered
collection, `profile`, `deletionLog`, or `balance:<accountId>` and exits
non-zero. Delete the temporary database after recording the result.

Firestore backups do not include Auth or Storage. Export Auth outside the
repository, confirm the test UID is present, and delete the export because it
contains user data. Storage is intentionally not restored: an orphaned
`temporaryUploads` record must ask for a new upload according to the pipeline
spec.
