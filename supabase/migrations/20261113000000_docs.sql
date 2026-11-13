-- CR-010: Firestore-shaped documents in one table. A document's path is its key, as in Firestore:
-- `users/{ownerId}/{collection}/{id}`, or a top-level `{collection}/{id}`. "C" collation orders
-- paths byte-wise, like Firestore orders document names.
create table if not exists public.docs (
  path          text collate "C" primary key,
  parent        text collate "C" not null,  -- the collection path
  collection_id text collate "C" not null,  -- the collection's own id, for collection-group queries
  owner_id      text,                       -- `users/{ownerId}/...`; null for top-level collections
  data          jsonb not null,
  updated_at    timestamptz not null default now()
);

create index if not exists docs_parent_idx on public.docs (parent);
create index if not exists docs_collection_idx on public.docs (collection_id);
create index if not exists docs_owner_idx on public.docs (owner_id);

-- Nothing reaches this table through the public API until a policy allows it (see the RLS migration).
alter table public.docs enable row level security;
