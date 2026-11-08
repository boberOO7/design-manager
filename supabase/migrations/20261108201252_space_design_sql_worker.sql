-- Process accepted inbox jobs inside Postgres. The per-job exception block
-- rolls back a failed CRM write without undoing other jobs or its claimed lease.
create function private.process_space_design_lead_jobs()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  job record;
  outcome text;
  claimed integer:=0;
  created integer:=0;
  duplicates integer:=0;
  retried integer:=0;
  failed integer:=0;
  stale integer:=0;
begin
  for job in select * from public.claim_space_design_leads(5) loop
    claimed:=claimed+1;
    begin
      outcome:=public.complete_space_design_lead(job.studio_id,job.submission_id,job.lease_token);
    exception when others then
      -- Do not put SQLERRM, contacts or payloads into cron output/diagnostics.
      outcome:=public.fail_space_design_lead(job.studio_id,job.submission_id,job.lease_token);
    end;
    case outcome
      when 'created' then created:=created+1;
      when 'duplicate' then duplicates:=duplicates+1;
      when 'retried' then retried:=retried+1;
      when 'failed' then failed:=failed+1;
      else stale:=stale+1;
    end case;
  end loop;
  return jsonb_build_object('claimed',claimed,'created',created,'duplicate',duplicates,
    'retried',retried,'failed',failed,'stale',stale);
end;
$$;
revoke all on function private.process_space_design_lead_jobs() from public,anon,authenticated,service_role;

-- Keep activation explicit. No HTTP dispatch, Vercel worker or Vault lookup.
select cron.schedule_in_database('studioflow-space-design-leads-worker','* * * * *',
  'select private.process_space_design_lead_jobs();',current_database(),null,false);
drop function private.dispatch_space_design_lead_worker();

-- Existing Vault records may be retained by operators; do not delete secrets
-- or shared pg_net/Vault extensions used by Meta and Web Push.
