-- Spending tips (CR-007 piece 3): the same read policy as 20261113000100, with `tips` added to the
-- owner collections a client may read (OWNER_DATA_REGISTRY marks it clientRead; a test fails if the
-- two diverge). Clients still only read; /api writes.
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
          'consents', 'tips'
        )
      )
    )
  );
