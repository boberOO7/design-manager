create or replace function private.finance_expense_service_calculations(p_studio uuid,p_calculate boolean) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare o record; p public.finance_expense_service_policies; source jsonb; boundary date; base text; digits integer;
  first_day date; last_day date; eligible date; month date; through date; segment_from date; target numeric; recorded numeric; months integer; issue text; source_issue text; candidate jsonb;
begin
  select recognition_start_month,base_currency into boundary,base from public.finance_settings where studio_id=p_studio and finalized_at is not null;
  if boundary is null and not p_calculate then return;end if;
  for o in
    with periods as (
      select obligations.schedule_id,obligations.period_start,i.expected_item_id,t.interval_months,t.amount,t.currency,t.name,t.category_id
      from public.finance_obligations obligations
      join public.finance_obligation_items i on i.studio_id=obligations.studio_id and i.obligation_id=obligations.id and i.component='recurring'
      join public.finance_schedule_terms t on t.studio_id=obligations.studio_id and t.id=obligations.terms_id
      where obligations.studio_id=p_studio and obligations.kind='recurring'
      union all
      select s.id,d::date,null,t.interval_months,t.amount,t.currency,t.name,t.category_id
      from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
      join public.finance_categories c on c.studio_id=t.studio_id and c.id=t.category_id
      cross join lateral generate_series(t.effective_from::timestamp,least(t.valid_through,(now() at time zone 'Europe/Kyiv')::date)::timestamp,make_interval(months=>t.interval_months)) d
      where p_calculate and s.studio_id=p_studio and s.kind='recurring' and t.commitment='agreed' and t.certainty='fixed'
        and c.nature='operating' and coalesce(c.default_key,'') not in ('salary','employee_bonus')
        and not (private.finance_labor_source_review(p_studio)->'cashTermIds' ? t.id::text)
        and not exists(select 1 from public.finance_obligations existing where existing.studio_id=p_studio and existing.schedule_id=s.id and existing.period_start=d::date)
    ) select *,expected_item_id is null as synthetic from periods order by period_start,schedule_id loop
    select * into p from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=o.schedule_id and first_period<=o.period_start
      order by first_period desc,revision desc limit 1;
    if p.id is null or p.policy='manual' or (not o.synthetic and private.finance_labor_cash_expected(p_studio,o.expected_item_id)) then continue;end if;
    months:=(extract(year from o.period_start)-extract(year from p.first_period))::integer*12
      +(extract(month from o.period_start)-extract(month from p.first_period))::integer;
    first_day:=(p.service_start+make_interval(months=>months))::date;
    last_day:=(p.service_start+make_interval(months=>months+p.service_months)-interval '1 day')::date;
    eligible:=case when p_calculate then greatest(first_day,coalesce(p.coverage_from,p.effective_from)) else greatest(first_day,p.effective_from,boundary,(select (recognition_enabled_at at time zone 'Europe/Kyiv')::date from public.finance_settings where studio_id=p_studio)) end;
    if eligible>least(last_day,(now() at time zone 'Europe/Kyiv')::date) then continue;end if;
    if p.policy='period_end' and last_day>(now() at time zone 'Europe/Kyiv')::date then continue;end if;
    source:=case when o.synthetic then jsonb_build_object('currency',o.currency,'amount',o.amount::text,'label',o.name) else private.finance_expense_source(p_studio,'expected',o.expected_item_id) end;
    issue:=null;
    if source is null then issue:='source_unavailable';
    elsif o.interval_months<>p.service_months then issue:='policy_stale';
    elsif p_calculate and not (private.finance_labor_source_review(p_studio)->>'reviewed')::boolean
      and exists(select 1 from jsonb_array_elements(private.finance_labor_source_review(p_studio)->'recurring') r where r->>'scheduleId'=o.schedule_id::text) then issue:='payroll_source_review';
    elsif not p_calculate and exists(select 1 from public.finance_labor_automation where studio_id=p_studio)
      and not (private.finance_labor_source_review(p_studio)->>'reviewed')::boolean then issue:='payroll_source_review';
    elsif exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio
      and (r.expected_item_id=o.expected_item_id or r.source_snapshot->>'economicExpectedId'=o.expected_item_id::text)
      and r.expense_policy_id is distinct from p.id) then issue:='manual_history';
    elsif exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio and r.expense_policy_id=p.id
      and r.expected_item_id=o.expected_item_id and r.kind<>'recognition') then issue:='source_corrected';end if;
    source_issue:=issue;
    select minor_units into digits from public.finance_currencies where code=source->>'currency';
    for month in select generate_series(date_trunc('month',case when p.policy='period_end' then last_day else eligible end),
      date_trunc('month',least(last_day,(now() at time zone 'Europe/Kyiv')::date)),interval '1 month')::date loop
      issue:=source_issue;
      segment_from:=case when p.policy='period_end' then eligible else greatest(month,eligible) end;
      through:=least((month+interval '1 month - 1 day')::date,last_day,(now() at time zone 'Europe/Kyiv')::date);
      target:=trunc((source->>'amount')::numeric*(through-first_day+1)/(last_day-first_day+1),digits)
        -trunc((source->>'amount')::numeric*(segment_from-first_day)/(last_day-first_day+1),digits);
      select coalesce(sum(amount),0) into recorded from public.finance_recognition_entries where studio_id=p_studio
        and expense_policy_id=p.id and expected_item_id=o.expected_item_id and recognized_on>=month and recognized_on<(month+interval '1 month')::date;
      if target<recorded then issue:='source_changed';end if;
      if target=recorded and issue is null then continue;end if;
      if issue is null and private.finance_expense_period_reviewed(p_studio,p.project_id,segment_from,through) then issue:='history_protected';end if;
      candidate:=jsonb_build_object('action','recognize','studioId',p_studio,'sourceId',coalesce(o.expected_item_id,md5(o.schedule_id::text||o.period_start::text)::uuid),'policyId',p.id,'month',month,
        'from',segment_from,'to',through,'amount',greatest(target-recorded,0)::text,'currency',source->>'currency','reportingCurrency',base,
        'projectId',p.project_id,'label',coalesce(source->>'label','Expense source unavailable'),'issue',issue,
        'source',source-'consumed','policy',to_jsonb(p),'recorded',recorded::text);
      return next candidate||jsonb_build_object('digest',md5(candidate::text));
    end loop;
  end loop;
end $$;

alter function public.get_finance_expense_automation_reporting(uuid) rename to get_finance_expense_automation_reporting_before_calculation_issues;
alter function public.get_finance_expense_automation_reporting_before_calculation_issues(uuid) set schema private;
revoke all on function private.get_finance_expense_automation_reporting_before_calculation_issues(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_expense_automation_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return private.get_finance_expense_automation_reporting_before_calculation_issues(p_studio_id)||jsonb_build_object('configurationIssues',
    coalesce((select jsonb_agg(distinct jsonb_build_object('scheduleId',c->'policy'->>'schedule_id','issue',c->>'issue'))
      from private.finance_expense_service_calculations(p_studio_id,true) c where c->>'issue' is not null),'[]'));
end $$;
revoke all on function public.get_finance_expense_automation_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_expense_automation_reporting(uuid) to authenticated;
notify pgrst,'reload schema';
