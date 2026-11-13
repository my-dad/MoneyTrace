-- CR-010: live dashboard updates. Realtime sends a change only to subscribers whose read policy
-- (docs_owner_read) lets them see the row, so this exposes nothing new.
alter publication supabase_realtime add table public.docs;
