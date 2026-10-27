-- Only the earning-condition event belongs to a month's revenue coverage.
-- A later acceptance/refund must not change an earlier delivery-only boundary.
alter function private.finance_month_evidence(uuid,date,jsonb) rename to finance_month_evidence_before_event_scope;
create function private.finance_month_evidence(p_studio uuid,p_month date,p_report jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare milestones jsonb; scoped jsonb:=p_report;
begin
  select coalesce(jsonb_agg((m-'earned')||jsonb_build_object('events',coalesce((select jsonb_agg(e order by e->>'id')
    from jsonb_array_elements(m->'events') e where e->>'kind'=m->>'condition'
      and (e->>'date')::date between p_month and least((p_month+interval '1 month - 1 day')::date,(now() at time zone 'Europe/Kyiv')::date)),'[]')) order by m->>'id'),'[]')
    into milestones from jsonb_array_elements(p_report->'earnings'->'milestones') m;
  if p_report->'earnings' is not null then
    scoped:=jsonb_set(p_report,'{earnings,milestones}',milestones);
  end if;
  return private.finance_month_evidence_before_event_scope(p_studio,p_month,scoped);
end $$;
revoke all on function private.finance_month_evidence(uuid,date,jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
