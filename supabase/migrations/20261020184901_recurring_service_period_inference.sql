-- Extend the existing source default to stable quarterly/annual service schedules.
-- Keep the private helper name and deterministic monthly identities for existing callers.
-- Existing explicit policies, history guards, exclusions and posting eligibility win.
-- No financial data is changed by this migration.
create or replace function private.finance_default_monthly_service(p_studio uuid,p_schedule uuid)
returns public.finance_expense_service_policies
language plpgsql stable security definer set search_path='' as $$
declare t public.finance_schedule_terms; s public.finance_schedules; c public.finance_categories;
  p public.finance_expense_service_policies; first_month date; setup public.finance_settings;
begin
  select * into s from public.finance_schedules where studio_id=p_studio and id=p_schedule and kind='recurring';
  select * into t from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule order by revision desc limit 1;
  select * into c from public.finance_categories where studio_id=p_studio and id=t.category_id;
  select * into setup from public.finance_settings where studio_id=p_studio and finalized_at is not null;
  if s.id is null or setup.studio_id is null or t.interval_months not in (1,3,12) or t.commitment<>'agreed' or t.certainty<>'fixed'
    or c.id is null or c.direction<>'outgoing' or c.nature<>'operating' or c.default_key in ('salary','employee_bonus')
    or exists(select 1 from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule)
    or exists(select 1 from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule and (interval_months<>t.interval_months or
      ((extract(year from effective_from)-extract(year from t.effective_from))::integer*12
       +(extract(month from effective_from)-extract(month from t.effective_from))::integer)%t.interval_months<>0))
    or private.finance_labor_source_review(p_studio)->'cashTermIds' ? t.id::text
    or exists(select 1 from public.finance_obligations o join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id
      where o.studio_id=p_studio and o.schedule_id=p_schedule and
        (exists(select 1 from public.finance_trip_entries e where e.studio_id=p_studio and e.expected_item_id=i.expected_item_id)
        or exists(select 1 from public.finance_trip_balances b where b.studio_id=p_studio and b.expected_item_id=i.expected_item_id))) then return null;end if;
  select min(effective_from) into first_month from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule;
  -- This deterministic identity is read-only. The worker persists a real policy before generating posting candidates.
  p.id:=md5('monthly-service:'||p_studio::text||p_schedule::text)::uuid;
  p.studio_id:=p_studio;p.schedule_id:=p_schedule;p.revision:=1;p.first_period:=first_month;
  p.service_start:=first_month;p.coverage_from:=first_month;p.service_months:=t.interval_months;p.policy:='service_days';
  p.effective_from:=greatest(first_month,date_trunc('month',now() at time zone 'Europe/Kyiv')::date,
    setup.recognition_start_month,(setup.recognition_enabled_at at time zone 'Europe/Kyiv')::date);
  p.created_by:=s.created_by;p.created_at:=t.created_at;p.source_default:=true;
  return p;
end $$;
revoke all on function private.finance_default_monthly_service(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.configure_finance_schedule_expense(p_studio uuid,p_schedule uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.finance_schedule_terms; cat public.finance_categories; prior public.finance_expense_service_policies;
  first_month date; start_date date; effective date; boundary date; result uuid; project uuid:=nullif(p_input->>'projectId','')::uuid;
  today date:=(now() at time zone 'Europe/Kyiv')::date;
  mode text:=coalesce(nullif(p_input->>'policy',''),'service_days');
begin
  if not private.is_finance_admin(p_studio) then raise exception 'finance_admin_required';end if;
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio and finalized_at is not null for update;

  select terms.* into t from public.finance_schedule_terms terms join public.finance_schedules s on s.studio_id=terms.studio_id and s.id=terms.schedule_id
    where terms.studio_id=p_studio and terms.schedule_id=p_schedule and s.kind='recurring' order by terms.revision desc limit 1;
  if t.id is null or t.revision is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  select * into cat from public.finance_categories where studio_id=p_studio and id=t.category_id;
  if coalesce((p_input->>'confirmed')::boolean,false) is not true or mode not in ('service_days','period_end','manual') or cat.nature<>'operating'
    or cat.default_key in ('salary','employee_bonus') then raise exception 'finance_input_invalid';end if;
  if exists(select 1 from public.finance_obligations o join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id
    where o.studio_id=p_studio and o.terms_id=t.id and (private.finance_labor_cash_expected(p_studio,i.expected_item_id)
      or exists(select 1 from public.finance_trip_entries e where e.studio_id=p_studio and e.expected_item_id=i.expected_item_id)
      or exists(select 1 from public.finance_trip_balances b where b.studio_id=p_studio and b.expected_item_id=i.expected_item_id))) then raise exception 'finance_expense_source_owned';end if;
  select * into prior from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule order by first_period desc,revision desc limit 1;
  -- Ordinary amount/currency/payment revisions keep the existing service anchor and attribution.
  if prior.id is not null and prior.service_months=t.interval_months
    and ((extract(year from t.effective_from)-extract(year from prior.first_period))::integer*12
      +(extract(month from t.effective_from)-extract(month from prior.first_period))::integer)%prior.service_months=0 and nullif(p_input->>'serviceStart','') is null
    and (not (p_input ? 'policy') or prior.policy=mode)
    and (not (p_input ? 'projectId') or prior.project_id is not distinct from project) then return prior.id;end if;
  first_month:=t.effective_from;
  if prior.id is null and not exists(select 1 from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule and (interval_months<>t.interval_months or
      ((extract(year from effective_from)-extract(year from t.effective_from))::integer*12
       +(extract(month from effective_from)-extract(month from t.effective_from))::integer)%t.interval_months<>0)) then
    select min(effective_from) into first_month from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule;
  end if;
  start_date:=nullif(p_input->>'serviceStart','')::date;
  if mode='manual' then
    start_date:=first_month;effective:=greatest(boundary,date_trunc('month',today)::date,first_month);
  elsif t.interval_months=1 then
    if start_date is not null and (start_date<first_month or start_date>=(first_month+interval '1 month')::date) then raise exception 'finance_input_invalid';end if;
    -- A partial initial month reduces eligible days; it must not shift every later month.
    effective:=greatest(boundary,date_trunc('month',today)::date,coalesce(start_date,first_month));
    start_date:=first_month;
  else
    if start_date is null then
      if exists(select 1 from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule and (interval_months<>t.interval_months or
      ((extract(year from effective_from)-extract(year from t.effective_from))::integer*12
       +(extract(month from effective_from)-extract(month from t.effective_from))::integer)%t.interval_months<>0)) then
        raise exception 'finance_expense_service_period_required';
      end if;
      -- effective_from identifies the service period; payout day/offset only schedule cash.
      start_date:=first_month;
    end if;
    effective:=greatest(boundary,date_trunc('month',today)::date,start_date);
  end if;
  if project is not null and (not cat.project_expense_enabled or not exists(select 1 from public.projects where studio_id=p_studio and id=project)) then raise exception 'finance_project_invalid';end if;
  if exists(select 1 from public.finance_recognition_entries r join public.finance_obligation_items i on i.studio_id=r.studio_id
    and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
    join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
    where r.studio_id=p_studio and o.schedule_id=p_schedule and o.period_start>=first_month) then raise exception 'finance_expense_history_protected';end if;
  insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,project_id,created_by,coverage_from,source_default)
    select p_studio,p_schedule,coalesce(max(revision),0)+1,first_month,start_date,t.interval_months,effective,mode,project,auth.uid(),case when t.interval_months=1 then coalesce(nullif(p_input->>'serviceStart','')::date,first_month) else start_date end,coalesce((p_input->>'sourceDefault')::boolean,false)
    from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule returning id into result;
  return result;
end $$;

create or replace function public.prepare_finance_automatic_expenses(p_studio_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare studio uuid; source record; defaults public.finance_expense_service_policies;
begin
  if auth.role() is distinct from 'service_role' and (p_studio_id is null or not private.is_finance_admin(p_studio_id)) then raise exception 'finance_admin_required';end if;
  for studio in select studio_id from public.finance_settings where finalized_at is not null and recognition_start_month is not null
    and (p_studio_id is null or studio_id=p_studio_id) order by studio_id for update loop
    for source in select s.id from public.finance_schedules s where s.studio_id=studio and s.kind='recurring'
      and not exists(select 1 from public.finance_recognition_entries r
        join public.finance_obligation_items i on i.studio_id=r.studio_id and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
        join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
        where r.studio_id=studio and o.schedule_id=s.id) loop
      defaults:=private.finance_default_monthly_service(studio,source.id);
      if defaults.id is null then continue;end if;
      insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,project_id,created_by,coverage_from,source_default)
        values(studio,source.id,1,defaults.first_period,defaults.service_start,defaults.service_months,defaults.effective_from,'service_days',null,defaults.created_by,defaults.coverage_from,true);
    end loop;
  end loop;
  return private.prepare_finance_expenses_before_monthly(p_studio_id);
end $$;
revoke all on function public.prepare_finance_automatic_expenses(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_finance_automatic_expenses(uuid) to authenticated,service_role;

create or replace function private.finance_expense_service_calculations(p_studio uuid,p_calculate boolean) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare o record; p public.finance_expense_service_policies; source jsonb; boundary date; base text; digits integer;
  first_day date; last_day date; eligible date; month date; through date; segment_from date; target numeric; recorded numeric; months integer; inferred boolean; issue text; source_issue text; candidate jsonb;
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
    if exists(select 1 from public.finance_categories c where c.studio_id=p_studio and c.id=o.category_id
      and (c.nature<>'operating' or c.default_key in ('salary','employee_bonus'))) then continue;end if;
    if not o.synthetic and (exists(select 1 from public.finance_trip_entries e where e.studio_id=p_studio and e.expected_item_id=o.expected_item_id)
      or exists(select 1 from public.finance_trip_balances b where b.studio_id=p_studio and b.expected_item_id=o.expected_item_id)) then continue;end if;
    inferred:=false;
    select * into p from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=o.schedule_id and first_period<=o.period_start
      order by first_period desc,revision desc limit 1;
    if p.id is null and p_calculate then p:=private.finance_default_monthly_service(p_studio,o.schedule_id);inferred:=p.id is not null;end if;
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
    elsif o.interval_months<>p.service_months or months%p.service_months<>0 then issue:='policy_stale';
    elsif nullif(source->>'projectId','')::uuid is not null and nullif(source->>'projectId','')::uuid is distinct from p.project_id then issue:='source_project';
    elsif inferred and exists(select 1 from public.finance_recognition_entries r
      join public.finance_obligation_items i on i.studio_id=r.studio_id and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
      join public.finance_obligations obligations on obligations.studio_id=i.studio_id and obligations.id=i.obligation_id
      where r.studio_id=p_studio and obligations.schedule_id=o.schedule_id) then issue:='manual_history';
    elsif p_calculate and (select default_key from public.finance_categories where studio_id=p_studio and id=o.category_id) in ('salary','employee_bonus','employer_costs') and not (private.finance_labor_source_review(p_studio)->>'reviewed')::boolean
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

-- A renewal beyond the rolling horizon must not pass an inverted reconciliation range.
CREATE OR REPLACE FUNCTION public.save_finance_schedule(p_studio_id uuid, p_request_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare payload jsonb:=jsonb_build_object('operation','schedule','input',p_input); result uuid;
  schedule public.finance_schedules; prior public.finance_schedule_terms; anchor public.finance_schedule_terms; category public.finance_categories;
  employee uuid:=nullif(p_input->>'employeeId','')::uuid; starts date:=(p_input->>'effectiveFrom')::date; digits integer; value numeric;
  first_day date:=date_trunc('month',now() at time zone 'Europe/Kyiv')::date;
  editable boolean:=false; old_from date; previous_edit text:=current_setting('studioflow.finance_payroll_draft_edit',true);
  previous_reconcile text:=current_setting('studioflow.finance_occurrence_reconcile',true);
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if employee is not null then perform 1 from public.studio_members where studio_id=p_studio_id and user_id=employee for share; end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  -- Normalize only newly saved payroll terms, after the original request retry check.
  -- Existing null terms and explicit historical cost revisions remain unknown.
  if p_input->>'kind'='payroll' then
    if coalesce((p_input->>'employeeDeductionsUnknown')::boolean,false) then
      if p_input->>'basis' is distinct from 'net' or nullif(btrim(p_input->>'employeeDeductions'),'') is not null then
        raise exception 'finance_compensation_invalid';
      end if;
      p_input:=p_input||jsonb_build_object('employeeDeductions','');
    else
      p_input:=p_input||jsonb_build_object('employeeDeductions',coalesce(nullif(btrim(p_input->>'employeeDeductions'),''),'0'));
    end if;
    p_input:=p_input||jsonb_build_object('employerCostStatus',coalesce(nullif(p_input->>'employerCostStatus',''),'fixed'));
    if p_input->>'employerCostStatus'<>'unknown' then
      if nullif(btrim(p_input->>'employerCost'),'') is null then
        p_input:=p_input||jsonb_build_object('employerCostStatus','fixed');
      end if;
      p_input:=p_input||jsonb_build_object('employerCost',coalesce(nullif(btrim(p_input->>'employerCost'),''),'0'));
    end if;
  end if;
  if not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_finalized_setup_required'; end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio_id and id=nullif(p_input->>'id','')::uuid;
  if schedule.id is null then
    if nullif(p_input->>'id','') is not null then raise exception 'finance_schedule_invalid'; end if;
    if employee is not null and (not exists(select 1 from public.studio_members m join public.profiles p on p.id=m.user_id where m.studio_id=p_studio_id and m.user_id=employee and m.is_active and p.is_active)
      or exists(select 1 from public.finance_schedules s where s.studio_id=p_studio_id and s.employee_id=employee and (s.stopped_from is null or (starts<s.stopped_from and exists(select 1 from public.finance_schedule_terms t where t.studio_id=s.studio_id and t.schedule_id=s.id and t.effective_from<s.stopped_from))))) then raise exception 'finance_employee_invalid'; end if;
    insert into public.finance_schedules(studio_id,kind,employee_id,created_by)
      values(p_studio_id,p_input->>'kind',employee,auth.uid()) returning * into schedule;
  elsif schedule.kind is distinct from p_input->>'kind' or schedule.employee_id is distinct from employee or schedule.stopped_from is not null then raise exception 'finance_schedule_invalid'; end if;
  select * into prior from public.finance_schedule_terms where studio_id=p_studio_id and schedule_id=schedule.id order by revision desc limit 1;
  if coalesce(prior.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  editable:=schedule.kind='payroll' and prior.id is not null
    and not private.finance_payroll_term_consumed(p_studio_id,prior.id);
  if editable then
    select * into anchor from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id
        and t.revision>coalesce((select max(h.revision) from public.finance_schedule_terms h
          where h.studio_id=p_studio_id and h.schedule_id=schedule.id
            and private.finance_payroll_term_consumed(p_studio_id,h.id)),0)
      order by t.revision limit 1;
    select min(t.effective_from) into old_from from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id and t.revision>=anchor.revision;
  end if;
  if schedule.kind='payroll' and (
    (editable and exists(select 1 from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id and t.revision<anchor.revision
        and t.effective_from>=starts))
    or exists(select 1 from public.finance_obligations o
      where o.studio_id=p_studio_id and o.employee_id=schedule.employee_id and o.kind='payroll'
        and o.period_start>=starts and (
          exists(select 1 from public.finance_payroll_cost_revisions r
            where r.studio_id=o.studio_id and r.obligation_id=o.id)
          or exists(select 1 from public.finance_obligation_items l
            join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
            where l.studio_id=o.studio_id and l.obligation_id=o.id and (i.is_established
              or exists(select 1 from public.finance_allocations a
                where a.studio_id=i.studio_id and a.expected_item_id=i.id)))))
  ) then raise exception 'finance_schedule_effective_date'; end if;
  if prior.id is not null and not editable and (
    starts<=prior.effective_from
    or (schedule.kind<>'payroll' and (starts<first_day or starts<=(now() at time zone 'Europe/Kyiv')::date))
    or exists(select 1 from public.finance_obligations o
      where o.studio_id=p_studio_id and o.schedule_id=schedule.id
        and o.period_start<starts and o.period_end>=starts)
    or (schedule.kind<>'payroll' and exists(select 1 from public.finance_obligations o
      join public.finance_obligation_items l on l.studio_id=o.studio_id and l.obligation_id=o.id
      join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where o.studio_id=p_studio_id and o.schedule_id=schedule.id and o.period_start>=starts
        and (i.is_established or exists(select 1 from public.finance_allocations a
          where a.studio_id=i.studio_id and a.expected_item_id=i.id))))
  ) then raise exception 'finance_schedule_effective_date'; end if;
  select * into category from public.finance_categories where studio_id=p_studio_id and id=(p_input->>'categoryId')::uuid and archived_at is null;
  if category.id is null or category.direction<>'outgoing' or (schedule.kind='payroll' and category.default_key is distinct from 'salary') then raise exception 'finance_category_invalid'; end if;
  if (schedule.kind='payroll') is distinct from (nullif(p_input->>'basis','') is not null) then raise exception 'finance_compensation_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  foreach value in array array[(p_input->>'amount')::numeric,nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,nullif(p_input->>'employerCost','')::numeric] loop
    if value is not null and (value<>round(value,digits) or value<0 or value>9999999999.9999) then raise exception 'finance_amount_invalid'; end if;
  end loop;
  if schedule.kind='payroll' then perform set_config('studioflow.finance_payroll_draft_edit','on',true); end if;
  if editable and anchor.revision<prior.revision then
    -- Only the unused suffix can be folded into one editable configuration.
    perform set_config('studioflow.finance_occurrence_reconcile','on',true);
    update public.finance_obligations o set terms_id=anchor.id
      where o.studio_id=p_studio_id and o.schedule_id=schedule.id
        and o.terms_id in (select t.id from public.finance_schedule_terms t
          where t.studio_id=p_studio_id and t.schedule_id=schedule.id and t.revision>anchor.revision);
    perform set_config('studioflow.finance_occurrence_reconcile',coalesce(previous_reconcile,''),true);
    for prior in select * from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id and t.revision>anchor.revision
      order by t.revision desc loop
      delete from public.finance_schedule_terms where studio_id=p_studio_id and id=prior.id;
    end loop;
    prior:=anchor;
  end if;
  insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,effective_through,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
  values(p_studio_id,schedule.id,coalesce(prior.revision,0)+case when editable then 0 else 1 end,btrim(p_input->>'name'),(p_input->>'amount')::numeric,p_input->>'currency',category.id,
    (p_input->>'intervalMonths')::integer,(p_input->>'payoutDay')::integer,coalesce((p_input->>'paymentMonthOffset')::integer,0),starts,nullif(p_input->>'effectiveThrough','')::date,
    p_input->>'commitment',p_input->>'certainty',nullif(p_input->>'basis',''),nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,
    case when p_input ? 'employerCost' then nullif(p_input->>'employerCost','')::numeric
      when schedule.kind='payroll' and prior.id is null and not(p_input ? 'employerCostStatus') then 0
      else prior.employer_cost end,
    coalesce(p_input->>'employerCostStatus',prior.employer_cost_status,case when schedule.kind='payroll' then 'fixed' else 'unknown' end),btrim(p_input->>'reason'),auth.uid())
  on conflict(studio_id,schedule_id,revision) do update set
    name=excluded.name,amount=excluded.amount,currency=excluded.currency,category_id=excluded.category_id,
    interval_months=excluded.interval_months,payout_day=excluded.payout_day,payment_month_offset=excluded.payment_month_offset,
    effective_from=excluded.effective_from,effective_through=excluded.effective_through,
    commitment=excluded.commitment,certainty=excluded.certainty,basis=excluded.basis,
    employee_payout=excluded.employee_payout,employee_deductions=excluded.employee_deductions,
    employer_cost=excluded.employer_cost,employer_cost_status=excluded.employer_cost_status,reason=excluded.reason;
  if editable and (least(old_from,starts)<=first_day+interval '11 months' or exists(select 1 from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id)) then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,least(old_from,starts),
      greatest((first_day+interval '11 months')::date,coalesce((select max(o.period_start) from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id),first_day)),auth.uid());
  elsif not editable and (starts<=first_day+interval '11 months' or exists(select 1 from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id)) then
    perform private.reconcile_finance_schedule_occurrences(p_studio_id,schedule.id,
      case when schedule.kind='payroll' then starts else greatest((first_day-interval '1 month')::date,starts) end,
      greatest(starts,(first_day+interval '11 months')::date,coalesce((select max(o.period_start) from public.finance_obligations o where o.studio_id=p_studio_id and o.schedule_id=schedule.id),first_day)),auth.uid());
  end if;
  if schedule.kind='payroll' then perform set_config('studioflow.finance_payroll_draft_edit',coalesce(previous_edit,''),true); end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,schedule.id,auth.uid(),now());
  return schedule.id;
end $function$;
notify pgrst,'reload schema';
