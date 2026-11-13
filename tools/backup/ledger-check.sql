-- CR-010 restore drill: every problem this finds is one row. A good restore returns none.
-- 1. A posted transaction whose entries don't balance (per currency).
select 'unbalanced transaction' as problem, data ->> 'transactionId' as subject
from docs
where collection_id = 'ledgerEntries'
group by owner_id, data ->> 'transactionId', data ->> 'currency'
having sum(case data ->> 'side' when 'debit' then (data ->> 'amountMinor')::bigint else -(data ->> 'amountMinor')::bigint end) <> 0
union all
-- 2. A stored balance that differs from its entries.
select 'balance differs from entries', b.data ->> 'accountId'
from docs b
left join lateral (
  select coalesce(sum(case e.data ->> 'side' when 'debit' then (e.data ->> 'amountMinor')::bigint else -(e.data ->> 'amountMinor')::bigint end), 0) as total
  from docs e
  where e.collection_id = 'ledgerEntries' and e.owner_id = b.owner_id and e.data ->> 'accountId' = b.data ->> 'accountId'
) s on true
where b.collection_id = 'balances' and (b.data ->> 'debitMinusCreditMinor')::bigint <> s.total;
