-- Internal provenance bounds cash-obligation maintenance for derived policies.
alter table public.finance_expense_service_policies add column source_default boolean not null default false;

-- Standard monthly source coverage is derived without changing existing records.
-- Persisted Phase 3 policies, including delivery/manual exceptions, always win.
create function private.finance_default_monthly_service(p_studio uuid,p_schedule uuid)
returns public.finance_expense_service_policies
language plpgsql stable security definer set search_path='' as $$
declare t public.finance_schedule_terms; s public.finance_schedules; c public.finance_categories;
  p public.finance_expense_service_policies; first_month date; setup public.finance_settings;
begin
  select * into s from public.finance_schedules where studio_id=p_studio and id=p_schedule and kind='recurring';
  select * into t from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule order by revision desc limit 1;
  select * into c from public.finance_categories where studio_id=p_studio and id=t.category_id;
  select * into setup from public.finance_settings where studio_id=p_studio and finalized_at is not null;
  if s.id is null or setup.studio_id is null or t.interval_months<>1 or t.commitment<>'agreed' or t.certainty<>'fixed'
    or c.id is null or c.direction<>'outgoing' or c.nature<>'operating' or c.default_key in ('salary','employee_bonus')
    or exists(select 1 from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule)
    or exists(select 1 from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule and interval_months<>1)
    or private.finance_labor_source_review(p_studio)->'cashTermIds' ? t.id::text
    or exists(select 1 from public.finance_obligations o join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id
      where o.studio_id=p_studio and o.schedule_id=p_schedule and
        (exists(select 1 from public.finance_trip_entries e where e.studio_id=p_studio and e.expected_item_id=i.expected_item_id)
        or exists(select 1 from public.finance_trip_balances b where b.studio_id=p_studio and b.expected_item_id=i.expected_item_id))) then return null;end if;
  select min(effective_from) into first_month from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule;
  -- This deterministic identity is read-only. The worker persists a real policy before generating posting candidates.
  p.id:=md5('monthly-service:'||p_studio::text||p_schedule::text)::uuid;
  p.studio_id:=p_studio;p.schedule_id:=p_schedule;p.revision:=1;p.first_period:=first_month;
  p.service_start:=first_month;p.coverage_from:=first_month;p.service_months:=1;p.policy:='service_days';
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
  if prior.id is not null and prior.service_months=t.interval_months and nullif(p_input->>'serviceStart','') is null
    and (not (p_input ? 'policy') or prior.policy=mode)
    and (not (p_input ? 'projectId') or prior.project_id is not distinct from project) then return prior.id;end if;
  first_month:=t.effective_from;
  if prior.id is null and not exists(select 1 from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule and interval_months<>t.interval_months) then
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
    if start_date is null then raise exception 'finance_expense_service_period_required';end if;
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

create or replace function public.save_finance_recurring_schedule(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; replay boolean; defaults public.finance_expense_service_policies;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  replay:=exists(select 1 from public.finance_planning_requests where studio_id=p_studio_id and request_id=p_request_id);
  result:=private.save_finance_recurring_schedule_before_expense(p_studio_id,p_request_id,p_input);
  if not replay then
    defaults:=private.finance_default_monthly_service(p_studio_id,result);
    if p_input->'expenseService'->>'confirmed'='true' then
      perform private.configure_finance_schedule_expense(p_studio_id,result,(p_input->'expenseService')||jsonb_build_object('revision',
        (select max(revision) from public.finance_schedule_terms where studio_id=p_studio_id and schedule_id=result)));
    elsif defaults.id is not null and not exists(select 1 from public.finance_recognition_entries r
      join public.finance_obligation_items i on i.studio_id=r.studio_id and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
      join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
      where r.studio_id=p_studio_id and o.schedule_id=result) then
      perform private.configure_finance_schedule_expense(p_studio_id,result,jsonb_build_object('confirmed',true,'sourceDefault',true,'revision',
        (select max(revision) from public.finance_schedule_terms where studio_id=p_studio_id and schedule_id=result)));
    end if;
  end if;
  return result;
end $$;
revoke all on function public.save_finance_recurring_schedule(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_recurring_schedule(uuid,uuid,jsonb) to authenticated;

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
    elsif o.interval_months<>p.service_months then issue:='policy_stale';
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

create or replace function private.prepare_finance_automatic_expenses_before_pending(p_studio_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare studio uuid; schedule record; result jsonb:='[]';
begin
  if auth.role() is distinct from 'service_role' and (p_studio_id is null or not private.is_finance_admin(p_studio_id)) then raise exception 'finance_admin_required';end if;
  for studio in select studio_id from public.finance_expense_service_policies where p_studio_id is null or studio_id=p_studio_id
    union select studio_id from public.finance_expense_receipts where p_studio_id is null or studio_id=p_studio_id loop
    perform 1 from public.studio_members where studio_id=studio order by user_id for share;
    perform 1 from public.finance_settings where studio_id=studio for update;
    for schedule in select schedule_id,min(case when source_default then greatest(first_period,date_trunc('month',now() at time zone 'Europe/Kyiv')::date) else first_period end) as first_period,(array_agg(created_by order by revision))[1] as actor
      from public.finance_expense_service_policies where studio_id=studio group by schedule_id loop
      perform private.reconcile_finance_schedule_occurrences(studio,schedule.schedule_id,schedule.first_period,
        (date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '11 months')::date,schedule.actor);
    end loop;
    result:=result||coalesce((select jsonb_agg(c) from private.finance_expense_service_candidates(studio) c where c->>'issue' is null),'[]');
    result:=result||coalesce((select jsonb_agg(jsonb_build_object('action','value','studioId',studio,'sourceId',r.id,'currency',r.currency,
      'reportingCurrency',r.reporting_currency,'to',r.recognized_on)) from public.finance_recognition_entries r
      where r.studio_id=studio and r.kind='recognition' and (r.expense_policy_id is not null or r.expense_receipt_id is not null) and r.reporting_amount is null),'[]');
  end loop;
  return result;
end $$;

-- Materialize only eligible active-source defaults under the existing studio lock.
-- No source, policy, obligation or ledger row is written by this migration itself.
alter function public.prepare_finance_automatic_expenses(uuid) rename to prepare_finance_expenses_before_monthly;
alter function public.prepare_finance_expenses_before_monthly(uuid) set schema private;
revoke all on function private.prepare_finance_expenses_before_monthly(uuid) from public,anon,authenticated,service_role;
create function public.prepare_finance_automatic_expenses(p_studio_id uuid default null) returns jsonb
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
        values(studio,source.id,1,defaults.first_period,defaults.service_start,1,defaults.effective_from,'service_days',null,defaults.created_by,defaults.coverage_from,true);
    end loop;
  end loop;
  return private.prepare_finance_expenses_before_monthly(p_studio_id);
end $$;
revoke all on function public.prepare_finance_automatic_expenses(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_finance_automatic_expenses(uuid) to authenticated,service_role;

alter function public.get_finance_expense_automation_reporting(uuid) rename to get_finance_expenses_before_monthly;
alter function public.get_finance_expenses_before_monthly(uuid) set schema private;
revoke all on function private.get_finance_expenses_before_monthly(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_expense_automation_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  return private.get_finance_expenses_before_monthly(p_studio_id)||jsonb_build_object( 'excludedScheduleIds',coalesce((select jsonb_agg(distinct schedule_id) from (
      select o.schedule_id from public.finance_obligations o
      join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id
      where o.studio_id=p_studio_id and
        (exists(select 1 from public.finance_trip_entries e where e.studio_id=p_studio_id and e.expected_item_id=i.expected_item_id)
        or exists(select 1 from public.finance_trip_balances b where b.studio_id=p_studio_id and b.expected_item_id=i.expected_item_id))
      union select s.id from public.finance_schedules s join lateral(select t.id from public.finance_schedule_terms t
        where t.studio_id=s.studio_id and t.schedule_id=s.id order by revision desc limit 1) t on true
      where s.studio_id=p_studio_id and private.finance_labor_source_review(p_studio_id)->'cashTermIds' ? t.id::text
    ) owned),'[]'));
end $$;
revoke all on function public.get_finance_expense_automation_reporting(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_expense_automation_reporting(uuid) to authenticated;
notify pgrst,'reload schema';
