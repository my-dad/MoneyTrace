-- CR-010: the scheduled jobs (were Cloud Scheduler) and the pipeline sweep (was a Firestore trigger).
-- pg_cron calls /api with the cron secret. Both values live in Supabase Vault, set once by Mabrur:
--   select vault.create_secret('https://<project>.supabase.co/functions/v1/api', 'api_url');
--   select vault.create_secret('<random 32+ chars>', 'cron_secret');
-- and the same cron secret as the function's CRON_SECRET.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.run_api_job(job text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'api_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := jsonb_build_object('job', job),
    timeout_milliseconds := 120000
  );
$$;
revoke all on function public.run_api_job(text) from public, anon, authenticated;

-- Same cadence as packages/contracts TRIGGERS (a test keeps them in step).
select cron.schedule('recoverExpiredClaims', '*/5 * * * *', $$select public.run_api_job('recoverExpiredClaims')$$);
select cron.schedule('dispatchFollowUps', '*/15 * * * *', $$select public.run_api_job('dispatchFollowUps')$$);
select cron.schedule('resumeQuotaBlockedEvents', '7 * * * *', $$select public.run_api_job('resumeQuotaBlockedEvents')$$);
select cron.schedule('purgeProviderResults', '17 3 * * *', $$select public.run_api_job('purgeProviderResults')$$);
-- The trigger's replacement: anything submitted but not yet driven through the pipeline.
select cron.schedule('advancePending', '* * * * *', $$select public.run_api_job('advancePending')$$);

-- Was a Firestore TTL policy: rate-limit windows past their expiry.
select cron.schedule('expireRateLimits', '23 * * * *', $$
  delete from public.docs
  where collection_id = 'rateLimits' and (data ->> 'expiresAtMs')::bigint < (extract(epoch from now()) * 1000)::bigint
$$);
