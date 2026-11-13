-- CR-010: replaces firebase/firestore.rules. Clients may only read, and only their own profile and
-- the owner collections with `clientRead: true` in OWNER_DATA_REGISTRY (a test fails if the two
-- diverge). Every write goes through the /api function, which connects as the database owner.
revoke all on table public.docs from anon, authenticated;
grant select on table public.docs to authenticated;

drop policy if exists docs_owner_read on public.docs;
create policy docs_owner_read on public.docs
  for select to authenticated
  using (
    owner_id = (select auth.uid())::text
    and (
      path = 'users/' || owner_id
      or (
        parent = 'users/' || owner_id || '/' || collection_id
        and collection_id in (
          'accounts', 'paymentInstruments', 'sourceEvents', 'transactions', 'ledgerEntries',
          'balances', 'cutoverMarkers', 'decisionRecords', 'cashAllocations', 'reconciliations',
          'followUps', 'conversations', 'conversationMessages', 'aiUsage', 'temporaryUploads',
          'consents'
        )
      )
    )
  );
