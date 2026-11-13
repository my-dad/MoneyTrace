-- Own-transfer pairing (CR-008): one owner's SMS advance through the pipeline one at a time, under
-- a lease in `pipelineLeases/{ownerId}`. A lease is deleted when its holder finishes; this job
-- deletes any whose holder died, so nothing about an owner lingers.
select cron.schedule('expirePipelineLeases', '*/5 * * * *', $$
  delete from public.docs
  where collection_id = 'pipelineLeases' and (data ->> 'expiresAtMs')::bigint < (extract(epoch from now()) * 1000)::bigint
$$);
