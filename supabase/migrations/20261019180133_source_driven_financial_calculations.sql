alter table public.finance_settings add column recognition_enabled_at timestamptz;
alter table public.finance_expense_service_policies add column coverage_from date;

create function public.enable_finance_recognition(p_studio_id uuid,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; setup public.finance_settings; payload jsonb:=jsonb_build_object('operation','enable_recognition');
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id and finalized_at is not null for update;
  if setup.studio_id is null then raise exception 'finance_setup_required';end if;
  if setup.recognition_start_month is null then
    update public.finance_settings set recognition_start_month=date_trunc('month',now() at time zone 'Europe/Kyiv')::date,
      recognition_enabled_at=clock_timestamp() where studio_id=p_studio_id;
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,p_studio_id,auth.uid(),now());
  return p_studio_id;
end $$;
revoke all on function public.enable_finance_recognition(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.enable_finance_recognition(uuid,uuid) to authenticated;

create function private.guard_finance_enablement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.recognition_enabled_at is not null and (new.recognition_enabled_at is distinct from old.recognition_enabled_at
    or new.recognition_start_month is distinct from old.recognition_start_month) then
    raise exception 'finance_activation_locked';end if;
  return new;
end $$;
revoke all on function private.guard_finance_enablement() from public,anon,authenticated,service_role;
create trigger finance_enablement_immutable before update on public.finance_settings for each row execute function private.guard_finance_enablement();

-- This predicate is shared by automatic discovery and the immutable book's insert guard.
create function private.finance_posting_eligible(p_studio uuid,p_day date,p_recorded timestamptz default null) returns boolean
language sql stable security definer set search_path='' as $$
 select recognition_start_month is not null and p_day>=recognition_start_month and
   (recognition_enabled_at is null or p_day>=(recognition_enabled_at at time zone 'Europe/Kyiv')::date
     and (p_recorded is null or p_recorded>=recognition_enabled_at))
 from public.finance_settings where studio_id=p_studio
$$;
revoke all on function private.finance_posting_eligible(uuid,date,timestamptz) from public,anon,authenticated,service_role;

create function private.guard_finance_posting_boundary() returns trigger
language plpgsql security definer set search_path='' as $$
declare enabled timestamptz; recorded timestamptz;
begin
  if new.kind<>'recognition' then return new;end if;
  select recognition_enabled_at into enabled from public.finance_settings where studio_id=new.studio_id for update;
  if enabled is null then return new;end if;
  -- Explicit corrections retain the original source's economic period.
  if new.earning_correction_of is not null then return new;end if;
  if new.earning_event_id is not null then select created_at into recorded from public.finance_project_earning_events where studio_id=new.studio_id and id=new.earning_event_id;
  elsif new.trip_entry_id is not null then select created_at into recorded from public.finance_trip_entries where studio_id=new.studio_id and id=new.trip_entry_id;
  elsif new.expense_receipt_id is not null then select created_at into recorded from public.finance_expense_receipts where studio_id=new.studio_id and id=new.expense_receipt_id;
  end if;
  if not private.finance_posting_eligible(new.studio_id,new.period_start,recorded) then raise exception 'finance_posting_boundary';end if;
  return new;
end $$;
revoke all on function private.guard_finance_posting_boundary() from public,anon,authenticated,service_role;
create trigger finance_posting_boundary before insert on public.finance_recognition_entries for each row execute function private.guard_finance_posting_boundary();

create or replace function private.configure_finance_schedule_expense(p_studio uuid,p_schedule uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.finance_schedule_terms; cat public.finance_categories; prior public.finance_expense_service_policies;
  first_month date; start_date date; effective date; boundary date; result uuid; project uuid:=nullif(p_input->>'projectId','')::uuid;
  today date:=(now() at time zone 'Europe/Kyiv')::date;
begin
  if not private.is_finance_admin(p_studio) then raise exception 'finance_admin_required';end if;
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio and finalized_at is not null for update;

  select terms.* into t from public.finance_schedule_terms terms join public.finance_schedules s on s.studio_id=terms.studio_id and s.id=terms.schedule_id
    where terms.studio_id=p_studio and terms.schedule_id=p_schedule and s.kind='recurring' order by terms.revision desc limit 1;
  if t.id is null or t.revision is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  select * into cat from public.finance_categories where studio_id=p_studio and id=t.category_id;
  if coalesce((p_input->>'confirmed')::boolean,false) is not true or cat.nature<>'operating'
    or cat.default_key in ('salary','employee_bonus') then raise exception 'finance_input_invalid';end if;
  if exists(select 1 from public.finance_obligations o join public.finance_obligation_items i on i.studio_id=o.studio_id and i.obligation_id=o.id
    where o.studio_id=p_studio and o.terms_id=t.id and (private.finance_labor_cash_expected(p_studio,i.expected_item_id)
      or exists(select 1 from public.finance_trip_entries e where e.studio_id=p_studio and e.expected_item_id=i.expected_item_id)
      or exists(select 1 from public.finance_trip_balances b where b.studio_id=p_studio and b.expected_item_id=i.expected_item_id))) then raise exception 'finance_expense_source_owned';end if;
  select * into prior from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule order by first_period desc,revision desc limit 1;
  -- Ordinary amount/currency/payment revisions keep the existing service anchor and attribution.
  if prior.id is not null and prior.service_months=t.interval_months then return prior.id;end if;
  first_month:=t.effective_from;
  if prior.id is null and not exists(select 1 from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule and interval_months<>t.interval_months) then
    select min(effective_from) into first_month from public.finance_schedule_terms where studio_id=p_studio and schedule_id=p_schedule;
  end if;
  start_date:=nullif(p_input->>'serviceStart','')::date;
  if t.interval_months=1 then
    if start_date is not null and (start_date<first_month or start_date>=(first_month+interval '1 month')::date) then raise exception 'finance_input_invalid';end if;
    -- A partial initial month reduces eligible days; it must not shift every later month.
    effective:=greatest(boundary,today,coalesce(start_date,first_month));
    start_date:=first_month;
  else
    if start_date is null then raise exception 'finance_expense_service_period_required';end if;
    effective:=greatest(boundary,today,start_date);
  end if;
  if project is not null and (not cat.project_expense_enabled or not exists(select 1 from public.projects where studio_id=p_studio and id=project)) then raise exception 'finance_project_invalid';end if;
  if exists(select 1 from public.finance_recognition_entries r join public.finance_obligation_items i on i.studio_id=r.studio_id
    and i.expected_item_id=private.finance_recognition_expected_root(r.studio_id,r.expected_item_id)
    join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
    where r.studio_id=p_studio and o.schedule_id=p_schedule and o.period_start>=first_month) then raise exception 'finance_expense_history_protected';end if;
  insert into public.finance_expense_service_policies(studio_id,schedule_id,revision,first_period,service_start,service_months,effective_from,policy,project_id,created_by,coverage_from)
    select p_studio,p_schedule,coalesce(max(revision),0)+1,first_month,start_date,t.interval_months,effective,'service_days',project,auth.uid(),case when t.interval_months=1 then coalesce(nullif(p_input->>'serviceStart','')::date,first_month) else start_date end
    from public.finance_expense_service_policies where studio_id=p_studio and schedule_id=p_schedule returning id into result;
  return result;
end $$;

create function private.finance_expense_service_calculations(p_studio uuid,p_calculate boolean) returns setof jsonb
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
revoke all on function private.finance_expense_service_calculations(uuid,boolean) from public,anon,authenticated,service_role;
create or replace function private.finance_expense_service_candidates(p_studio uuid) returns setof jsonb
language sql stable security definer set search_path='' as $$select * from private.finance_expense_service_calculations(p_studio,false)$$;

create or replace function public.confirm_finance_expense_receipt(p_studio_id uuid,p_request_id uuid,p_kind text,p_source_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare source jsonb; receipt public.finance_expense_receipts; result uuid; boundary date; project uuid; occurred date:=(p_input->>'date')::date;
  payload jsonb:=jsonb_build_object('operation','expense_receipt','kind',p_kind,'sourceId',p_source_id,'input',p_input);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio_id and finalized_at is not null;

  if coalesce((p_input->>'confirmed')::boolean,false) is not true or occurred is null
    or occurred>(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_input_invalid';end if;
  source:=private.finance_expense_source(p_studio_id,p_kind,p_source_id);
  if source is null then raise exception 'finance_expense_source_invalid';end if;
  if source->>'scheduleId' is not null then raise exception 'finance_expense_service_period_required';end if;
  if source->>'version' is distinct from p_input->>'version' then raise exception 'finance_version_conflict';end if;
  project:=coalesce((source->>'projectId')::uuid,nullif(p_input->>'projectId','')::uuid);
  if source->>'projectId' is not null and nullif(p_input->>'projectId','') is not null and project::text is distinct from p_input->>'projectId' then raise exception 'finance_project_invalid';end if;
  select * into receipt from public.finance_expense_receipts where studio_id=p_studio_id
    and (expected_item_id=private.finance_recognition_expected_root(p_studio_id,p_source_id) and p_kind='expected' or movement_id=p_source_id and p_kind='movement');
  if receipt.id is not null then
    if receipt.occurred_on<>occurred or receipt.project_id is distinct from project or receipt.source_version is distinct from source->>'version' then raise exception 'finance_request_conflict';end if;
    result:=receipt.id;
  else
    if (source->>'consumed')::numeric<>0 then raise exception 'finance_expense_manual_history';end if;
    if private.finance_expense_period_reviewed(p_studio_id,project,occurred,occurred) and not coalesce((p_input->>'approveReviewed')::boolean,false) then
      raise exception 'finance_expense_history_protected';end if;
    insert into public.finance_expense_receipts(studio_id,expected_item_id,movement_id,occurred_on,project_id,source_version,snapshot,created_by)
      values(p_studio_id,case when p_kind='expected' then private.finance_recognition_expected_root(p_studio_id,p_source_id) end,case when p_kind='movement' then p_source_id end,occurred,project,source->>'version',source,auth.uid()) returning id into result;
    if private.finance_posting_eligible(p_studio_id,occurred,clock_timestamp()) then
    perform private.post_finance_recognition_core(p_studio_id,jsonb_build_object('sourceKind',p_kind,'sourceId',p_source_id,'projectId',project,
      'classification',case when project is null then 'overhead' else 'direct_cost' end,'amount',source->>'amount','date',occurred,
      'periodStart',occurred,'periodEnd',occurred,'description',source->>'label','reason','Confirmed actual product or service receipt','fx',p_input->'fx'),auth.uid(),result,null);
    end if;
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

create or replace function private.finance_pending_source_candidates(p_studio uuid) returns setof jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('action','earning','studioId',e.studio_id,'sourceId',e.id,
    'currency',coalesce(root.currency,t.currency),'reportingCurrency',coalesce(root.reporting_currency,s.base_currency),'to',e.occurred_on)
  from public.finance_project_earning_events e
  join public.finance_project_earning_milestones m on m.studio_id=e.studio_id and m.id=e.milestone_id and m.active and m.condition=e.kind
  join public.finance_project_terms t on t.studio_id=m.studio_id and t.id=m.terms_id
  join public.finance_settings s on s.studio_id=e.studio_id and s.finalized_at is not null
  left join lateral(select r.* from public.finance_recognition_entries r where r.studio_id=e.studio_id and r.earning_event_id=e.id
    and r.kind='recognition' order by r.created_at,r.id limit 1) root on true
  left join lateral(select a.exception from public.finance_project_earning_attempts a where a.studio_id=e.studio_id and a.event_id=e.id
    order by a.created_at desc,a.id desc limit 1) attempt on true
  where e.studio_id=p_studio and private.finance_posting_eligible(e.studio_id,e.occurred_on,e.created_at) and e.occurred_on between s.recognition_start_month and (now() at time zone 'Europe/Kyiv')::date
    and not exists(select 1 from public.finance_project_earning_events v where v.studio_id=e.studio_id and v.milestone_id=m.id and v.kind='void')
    and (root.id is null and (attempt.exception is null or attempt.exception in
      ('finance_recognition_inactive','finance_fx_required','finance_fx_unavailable','finance_recognition_source_invalid'))
      or root.reporting_amount is null and root.id is not null
        and exists(select 1 from public.finance_recognized_actuals r where r.studio_id=e.studio_id and r.id=root.id))
  union all
  select jsonb_build_object('action','trip','studioId',e.studio_id,'sourceId',e.id,
    'currency',null,'reportingCurrency',e.reporting_currency,'to',e.financial_date)
  from public.finance_trip_entries e
  join public.finance_trips t on t.studio_id=e.studio_id and t.id=e.trip_id
  join public.finance_settings s on s.studio_id=e.studio_id and s.finalized_at is not null
  where e.studio_id=p_studio and e.kind='expense' and e.reverses_id is null
    and private.finance_posting_eligible(e.studio_id,e.financial_date,e.created_at) and e.financial_date between s.recognition_start_month and (now() at time zone 'Europe/Kyiv')::date
    and not private.finance_expense_period_reviewed(e.studio_id,t.project_id,e.financial_date,e.financial_date)
    and not exists(select 1 from public.finance_movements effect where effect.studio_id=e.studio_id
      and (effect.related_movement_id=e.movement_id or effect.related_movement_id in
        (select id from public.finance_movements where studio_id=e.studio_id and related_movement_id=e.movement_id))
      and private.finance_expense_period_reviewed(e.studio_id,t.project_id,effect.financial_date,effect.financial_date))
    and not exists(select 1 from public.finance_recognition_entries r where r.studio_id=e.studio_id and r.trip_entry_id=e.id and r.kind='recognition')
    and not exists(select 1 from public.finance_recognition_entries r where r.studio_id=e.studio_id and r.source_kind<>'trip'
      and (r.movement_id=e.movement_id or e.expected_item_id is not null
        and (r.expected_item_id=private.finance_recognition_expected_root(e.studio_id,e.expected_item_id)
          or r.source_snapshot->>'economicExpectedId'=private.finance_recognition_expected_root(e.studio_id,e.expected_item_id)::text)))
$$;

create or replace function private.capture_finance_trip_fact(p_studio uuid,p_entry uuid,p_reason text,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare entry public.finance_trip_entries; trip public.finance_trips; setup public.finance_settings; result uuid; category uuid; event record;
begin
  select * into entry from public.finance_trip_entries where studio_id=p_studio and id=p_entry and kind='expense' and reverses_id is null;
  select * into setup from public.finance_settings where studio_id=p_studio;
  if entry.id is null or setup.recognition_start_month is null or entry.financial_date<setup.recognition_start_month or not private.finance_posting_eligible(p_studio,entry.financial_date,entry.created_at) then return null; end if;
  select id into result from public.finance_recognition_entries where studio_id=p_studio and trip_entry_id=p_entry and kind='recognition';
  if result is not null then return result; end if;
  select * into trip from public.finance_trips where studio_id=p_studio and id=entry.trip_id;
  category:=private.trip_category(p_studio,'outgoing');
  insert into public.finance_recognition_entries(studio_id,classification,source_kind,trip_entry_id,project_id,category_id,source_snapshot,
    period_start,period_end,recognized_on,description,currency,amount,vat_amount,gross_amount,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,reason,created_by)
  values(p_studio,case when trip.project_id is null then 'overhead' else 'direct_cost' end,'trip',entry.id,trip.project_id,category,
    jsonb_build_object('trip',to_jsonb(trip),'entry',to_jsonb(entry),'recognitionDate',entry.financial_date),entry.financial_date,entry.financial_date,entry.financial_date,
    left(trip.title||case when entry.label='' then '' else ' · '||entry.label end,2000),entry.currency,entry.amount,0,entry.amount,
    entry.reporting_currency,entry.reporting_amount,entry.fx_rate,entry.fx_source,entry.fx_effective_date,p_reason,p_actor) returning id into result;
  -- Explicit confirmation of an existing source also preserves its immutable correction/refund chain.
  if exists(select 1 from public.finance_trip_entries where studio_id=p_studio and reverses_id=entry.id) then
    perform private.cancel_finance_trip_fact(p_studio,entry.id,'Trip expense source correction',p_actor);
  elsif entry.movement_id is not null then
    for event in select m.id from public.finance_movements m where m.studio_id=p_studio and
      (m.related_movement_id=entry.movement_id or m.related_movement_id in(select id from public.finance_movements where studio_id=p_studio and related_movement_id=entry.movement_id))
      order by m.created_at,m.id loop perform private.apply_finance_trip_cash_fact(p_studio,event.id); end loop;
  end if;
  return result;
end $$;

create function private.finance_calculated_labor_candidates(p_studio uuid,p_open boolean) returns setof jsonb
language sql stable security definer set search_path='' as $$
  with terms as (
    select s.employee_id,s.id as schedule_id,t.id as terms_id,d::date as period_start,
      least((d+make_interval(months=>t.interval_months)-interval '1 day')::date,t.valid_through) as period_end
    from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    cross join lateral generate_series(t.effective_from::timestamp,
      least(t.valid_through,case when p_open then (now() at time zone 'Europe/Kyiv')::date else date_trunc('month',now() at time zone 'Europe/Kyiv')::date-1 end)::timestamp,
      make_interval(months=>t.interval_months)) d
    where s.studio_id=p_studio and s.kind='payroll'
  ), synthetic as (
    select employee_id,period_start,max(period_end) as period_end,count(*) as candidates,
      case when count(*)=1 then (array_agg(schedule_id))[1] end as schedule_id,
      case when count(*)=1 then (array_agg(terms_id))[1] end as terms_id
    from terms t where period_start<=case when p_open then (now() at time zone 'Europe/Kyiv')::date else date_trunc('month',now() at time zone 'Europe/Kyiv')::date-1 end and not exists(
      select 1 from public.finance_obligations o where o.studio_id=p_studio and o.employee_id=t.employee_id and o.kind='payroll'
        and o.period_start<=t.period_end and o.period_end>=t.period_start)
    group by employee_id,period_start
  ), work as (
    select user_id,work_date from public.work_log_entries where studio_id=p_studio
    union select user_id,work_date from public.work_log_days where studio_id=p_studio
  ), missing as (
    select distinct w.user_id as employee_id,date_trunc('month',w.work_date)::date as period_start,
      (date_trunc('month',w.work_date)+interval '1 month - 1 day')::date as period_end
    from work w where w.work_date<date_trunc('month',now() at time zone 'Europe/Kyiv')::date
      and not exists(select 1 from public.finance_obligations o where o.studio_id=p_studio and o.employee_id=w.user_id
        and o.kind='payroll' and w.work_date between o.period_start and o.period_end)
      and not exists(select 1 from synthetic t where t.employee_id=w.user_id and w.work_date between t.period_start and t.period_end)
  ), candidates as (
    select o.employee_id,o.period_start,o.period_end,o.schedule_id,o.terms_id,o.id as obligation_id,o.kind,1::bigint as candidates
      from public.finance_obligations o where o.studio_id=p_studio and o.kind in ('payroll','bonus') and o.period_start<=case when p_open then (now() at time zone 'Europe/Kyiv')::date else date_trunc('month',now() at time zone 'Europe/Kyiv')::date-1 end
    union all select employee_id,period_start,period_end,schedule_id,terms_id,null,'payroll',candidates from synthetic
    union all select employee_id,period_start,period_end,null,null,null,'missing',0 from missing
  ) select to_jsonb(c)||jsonb_build_object('sourceKey',case when c.kind='bonus' then 'bonus:'||c.obligation_id::text
    else c.kind||':'||c.employee_id::text||':'||c.period_start::text end) from candidates c order by period_start,employee_id,kind
$$;
revoke all on function private.finance_calculated_labor_candidates(uuid,boolean) from public,anon,authenticated,service_role;

create function private.finance_labor_reporting_core(p_studio_id uuid,p_fx jsonb,p_open boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare candidate jsonb; o public.finance_obligations; cfg public.finance_labor_automation; t public.finance_schedule_terms;
  source jsonb; basis jsonb; values_json jsonb; issues jsonb; periods jsonb:='[]'; fx jsonb; valuation record; base text;
  known numeric; remaining numeric; calculated numeric; recognized numeric; known_total numeric; recognized_native numeric;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  if jsonb_typeof(p_fx) is distinct from 'object' then raise exception 'finance_input_invalid';end if;
  select base_currency into base from public.finance_settings where studio_id=p_studio_id;
  for candidate in select * from private.finance_calculated_labor_candidates(p_studio_id,p_open) loop
    source:=null; fx:=null; t:=null; known:=null; remaining:=null; calculated:=null; recognized:=0; known_total:=null; recognized_native:=0;
    o:=null;
    if candidate->>'obligation_id' is not null then
      select * into o from public.finance_obligations where studio_id=p_studio_id and id=(candidate->>'obligation_id')::uuid;
      source:=private.finance_labor_source(p_studio_id,o.id);
    else
      o.studio_id:=p_studio_id;o.employee_id:=(candidate->>'employee_id')::uuid;o.schedule_id:=(candidate->>'schedule_id')::uuid;
      o.terms_id:=(candidate->>'terms_id')::uuid;o.kind:='payroll';
      o.period_start:=(candidate->>'period_start')::date;o.period_end:=(candidate->>'period_end')::date;
      select full_name into o.employee_name from public.profiles where id=o.employee_id;
      select * into t from public.finance_schedule_terms where studio_id=p_studio_id and id=o.terms_id;
      if t.id is not null then
        source:=jsonb_build_object('sourceReady',t.basis in ('net','gross') and ((t.commitment='agreed' and t.certainty='fixed') or t.amount=0),'currency',t.currency,'basis',t.basis,
          'deductionsStatus',case when t.employee_deductions is null then 'unknown' else 'fixed' end,'employerStatus',t.employer_cost_status,
          'knownCost',private.finance_payroll_known_cost(t.basis,t.amount,t.employee_payout,coalesce(t.employee_deductions,0),
            case when t.employer_cost_status='fixed' then coalesce(t.employer_cost,0) else 0 end)::text,
          'recognizedCost','0','remainingCost',private.finance_payroll_known_cost(t.basis,t.amount,t.employee_payout,coalesce(t.employee_deductions,0),
            case when t.employer_cost_status='fixed' then coalesce(t.employer_cost,0) else 0 end)::text);
      end if;
    end if;
    cfg:=private.finance_labor_configuration(p_studio_id);
    cfg.studio_id:=p_studio_id;cfg.starts_on:=o.period_start;
    if source is not null then
      select nullif(c.snapshot->'proposalFx','null'::jsonb) into fx from public.finance_labor_calculations c
        where c.studio_id=p_studio_id and c.obligation_id=o.id and c.status<>'provisional'
          and c.snapshot->'source'->>'currency'=source->>'currency' order by c.created_at desc,c.id desc limit 1;
      if fx is null and (select count(distinct p.fx_rate) from public.finance_labor_cost_pools p
        where p.studio_id=p_studio_id and p.obligation_id=o.id and p.fx_rate is not null)=1 then
        select jsonb_build_object('rate',p.fx_rate::text,'source',p.fx_source,'effectiveDate',p.fx_effective_date) into fx
          from public.finance_labor_cost_pools p where p.studio_id=p_studio_id and p.obligation_id=o.id and p.fx_rate is not null order by p.id limit 1;
      end if;
      fx:=coalesce(fx,p_fx->((source->>'currency')||':'||least(o.period_end,(now() at time zone 'Europe/Kyiv')::date)::text));
      if source->>'currency'=base or fx is not null then
        select * into valuation from private.finance_valuation(source->>'currency',base,least(o.period_end,(now() at time zone 'Europe/Kyiv')::date),(source->>'knownCost')::numeric,fx);
        fx:=jsonb_build_object('rate',valuation.rate::text,'source',valuation.source,'effectiveDate',valuation.effective_date);
      end if;
    end if;
    basis:=private.finance_labor_period_basis(p_studio_id,o,cfg,source,fx,base);
    issues:=basis->'issues';
    if candidate->>'terms_id' is null and candidate->>'kind'<>'bonus' then
      issues:=issues||jsonb_build_array(case when (candidate->>'candidates')::integer>1 then 'ambiguous_salary' else 'missing_salary' end);
    end if;
    if jsonb_array_length(basis->'missingDates')>0 then issues:=issues||jsonb_build_array('missing_reports');end if;
    if cfg.internal_project_id is null and jsonb_array_length(basis->'projectIds')>0 then issues:=issues||jsonb_build_array('internal_classification');end if;
    basis:=basis||jsonb_build_object('issues',issues);
    recognized_native:=coalesce((source->>'recognizedCost')::numeric,0);
    if coalesce((source->>'sourceReady')::boolean,false) and not (issues ? 'partial_employment') then
      known:=(source->>'knownCost')::numeric;recognized_native:=(source->>'recognizedCost')::numeric;
      remaining:=(source->>'remainingCost')::numeric;
    end if;
    if remaining>=0 then values_json:=private.finance_provisional_labor_values(basis);
    else values_json:=jsonb_build_object('provisionalAllocations','[]'::jsonb,'provisionalRemainder',null);end if;
    if o.period_end<(now() at time zone 'Europe/Kyiv')::date and remaining>=0 and values_json->>'provisionalRemainder' is null and fx is not null then
      select * into valuation from private.finance_valuation(source->>'currency',base,least(o.period_end,(now() at time zone 'Europe/Kyiv')::date),remaining,fx);
      values_json:=values_json||jsonb_build_object('provisionalRemainder',valuation.reporting_amount::text);
    end if;
    if o.period_end>=(now() at time zone 'Europe/Kyiv')::date and remaining=0 then values_json:=jsonb_build_object('provisionalRemainder','0','provisionalAllocations','[]');end if;
    calculated:=(values_json->>'provisionalRemainder')::numeric+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(values_json->'provisionalAllocations') a),0);
    select case when count(*) filter(where available_reporting_amount is null)>0 then null else coalesce(sum(available_reporting_amount),0) end into recognized
      from public.finance_labor_cost_pools where studio_id=p_studio_id and obligation_id=o.id;
    known_total:=recognized+calculated;
    if values_json->'issues' is not null then issues:=values_json->'issues';end if;
    if (basis->>'manual')::boolean and remaining>0 then issues:=issues||jsonb_build_array('manual_attribution');end if;
    periods:=periods||jsonb_build_array(jsonb_build_object('sourceKey',candidate->>'sourceKey','obligationId',o.id,'scheduleId',o.schedule_id,'termsId',o.terms_id,
      'employeeId',o.employee_id,'label',coalesce(o.employee_name,o.employee_id::text),'periodStart',o.period_start,'periodEnd',least(o.period_end,(now() at time zone 'Europe/Kyiv')::date),
      'currency',source->>'currency','knownNative',known::text,'recognizedNative',recognized_native::text,'remainingNative',remaining::text,
      'reportingCurrency',base,'knownStudioCost',known_total::text,'recognizedCost',recognized::text,'calculatedCost',calculated::text,
      'allocations',coalesce(values_json->'provisionalAllocations','[]'),'unattributedCost',values_json->>'provisionalRemainder',
      'projectIds',basis->'projectIds','expectedMinutes',basis->'expectedMinutes','completedDays',basis->'completedDays','requiredDays',basis->'requiredDays',
      'missingDates',basis->'missingDates','issues',issues,'fx',fx));
  end loop;
  return jsonb_build_object('asOf',(now() at time zone 'Europe/Kyiv')::date,'reportingCurrency',base,'periods',periods);
end $$;
revoke all on function private.finance_labor_reporting_core(uuid,jsonb,boolean) from public,anon,authenticated,service_role;
create or replace function public.get_finance_historical_labor_reporting(p_studio_id uuid,p_fx jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer set search_path='' as $$select private.finance_labor_reporting_core(p_studio_id,p_fx,false)$$;
create function public.get_finance_calculated_labor_reporting(p_studio_id uuid,p_fx jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer set search_path='' as $$select private.finance_labor_reporting_core(p_studio_id,p_fx,true)$$;
revoke all on function public.get_finance_calculated_labor_reporting(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_calculated_labor_reporting(uuid,jsonb) to authenticated;

-- Calculations are a read of economic evidence, never a posting queue.
create function public.get_finance_source_calculations(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; services jsonb; base text;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select base_currency into base from public.finance_settings where studio_id=p_studio_id;
  select coalesce(jsonb_agg(jsonb_build_object('id','service:'||(c->>'sourceId')||':'||(c->>'month'),'sourceId',c->>'sourceId',
    'classification',case when c->>'projectId' is null then 'overhead' else 'direct_cost' end,'date',c->>'to','projectId',c->>'projectId',
    'currency',c->>'currency','amount',case when c->>'issue' is null or c->>'issue'='history_protected' then c->>'amount' end,
    'reportingAmount',null,'reportingCurrency',base,'label',c->>'label','issue',c->>'issue','href','/finance/schedules?expense='||(c->'policy'->>'schedule_id'))),'[]') into services
    from private.finance_expense_service_calculations(p_studio_id,true) c;
  with earned as (
    select e.id,e.occurred_on,m.project_id,m.title,m.net_amount,t.currency,m.order_id,
      case when current_terms.id is distinct from m.terms_id or orders.status<>'confirmed'
        or exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio_id and r.classification='revenue'
          and private.finance_recognition_order(r.studio_id,r.id)=m.order_id and r.earning_event_id is null)
        or (select sum(net_amount) from public.finance_project_earning_milestones where studio_id=p_studio_id and order_id=m.order_id and active)>current_terms.net_amount
        then 'source_conflict' end as issue
    from public.finance_project_earning_events e join public.finance_project_earning_milestones m on m.studio_id=e.studio_id and m.id=e.milestone_id and m.active and m.condition=e.kind
    join public.finance_project_terms t on t.studio_id=m.studio_id and t.id=m.terms_id
    join public.finance_project_orders orders on orders.studio_id=m.studio_id and orders.id=m.order_id
    left join public.finance_project_current_terms current_terms on current_terms.studio_id=m.studio_id and current_terms.order_id=m.order_id and current_terms.stream='design'
    where e.studio_id=p_studio_id and e.occurred_on<=(now() at time zone 'Europe/Kyiv')::date
      and not exists(select 1 from public.finance_project_earning_events v where v.studio_id=e.studio_id and v.milestone_id=e.milestone_id and v.kind='void')
      and not exists(select 1 from public.finance_recognition_entries r where r.studio_id=e.studio_id and r.earning_event_id=e.id)
  ), calculations as (
    select 'earning:'||id::text as id,id as source_id,'revenue' as classification,occurred_on as day,project_id,currency,
      case when issue is null then net_amount end as amount,null::numeric as reporting_amount,base as reporting_currency,title as label,issue,
      '/projects/'||project_id||'?view=finance' as href from earned
    union all
    select 'receipt:'||receipt.id,receipt.id,case when receipt.project_id is null then 'overhead' else 'direct_cost' end,
      receipt.occurred_on,receipt.project_id,receipt.snapshot->>'currency',
      case when source.info is not null and source.info->>'version'=receipt.source_version then (receipt.snapshot->>'amount')::numeric end,
      null,base,receipt.snapshot->>'label',case when source.info is null or source.info->>'version' is distinct from receipt.source_version then 'source_conflict' end,
      case when receipt.expected_item_id is not null then '/finance/expected?item='||receipt.expected_item_id else '/finance/movements?movement='||receipt.movement_id end
    from public.finance_expense_receipts receipt
    cross join lateral(select private.finance_expense_source(p_studio_id,case when receipt.expected_item_id is null then 'movement' else 'expected' end,coalesce(receipt.expected_item_id,receipt.movement_id)) info) source
    where receipt.studio_id=p_studio_id and not exists(select 1 from public.finance_recognition_entries r where r.studio_id=p_studio_id
      and (r.expense_receipt_id=receipt.id or receipt.movement_id is not null and r.movement_id=receipt.movement_id
        or receipt.expected_item_id is not null and (r.expected_item_id=receipt.expected_item_id or r.source_snapshot->>'economicExpectedId'=receipt.expected_item_id::text)))
    union all
    select 'trip:'||e.id,e.id,case when trip.project_id is null then 'overhead' else 'direct_cost' end,e.financial_date,
      trip.project_id,e.currency,e.net_amount,e.net_reporting_amount,e.reporting_currency,trip.title,null,'/finance/trips/'||e.trip_id
    from public.finance_trip_entry_values e join public.finance_trips trip on trip.studio_id=e.studio_id and trip.id=e.trip_id
    where e.studio_id=p_studio_id and e.kind='expense' and e.reverses_id is null and e.financial_date<=(now() at time zone 'Europe/Kyiv')::date
      and not exists(select 1 from public.finance_trip_entries v where v.studio_id=e.studio_id and v.reverses_id=e.id)
      and not exists(select 1 from public.finance_recognition_entries r where r.studio_id=e.studio_id
        and (r.trip_entry_id=e.id or e.movement_id is not null and r.movement_id=e.movement_id
          or e.expected_item_id is not null and (r.expected_item_id=private.finance_recognition_expected_root(p_studio_id,e.expected_item_id)
            or r.source_snapshot->>'economicExpectedId'=private.finance_recognition_expected_root(p_studio_id,e.expected_item_id)::text)))
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceId',source_id,'classification',classification,'date',day,'projectId',project_id,
    'currency',currency,'amount',amount::text,'reportingAmount',reporting_amount::text,'reportingCurrency',reporting_currency,'label',label,'issue',issue,'href',href) order by day,id),'[]') into rows from calculations;
  return services||rows;
end $$;
revoke all on function public.get_finance_source_calculations(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_source_calculations(uuid) to authenticated;

-- Enrich the final source/recognition snapshot, without invoking a worker.
alter function public.get_finance_management_reporting(uuid,jsonb) rename to get_finance_management_reporting_before_calculations;
alter function public.get_finance_management_reporting_before_calculations(uuid,jsonb) set schema private;
revoke all on function private.get_finance_management_reporting_before_calculations(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.get_finance_management_reporting(p_studio_id uuid,p_historical_fx jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare report jsonb; months jsonb; first_day date;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  report:=private.get_finance_management_reporting_before_calculations(p_studio_id,p_historical_fx)
    ||jsonb_build_object('historicalLabor',public.get_finance_calculated_labor_reporting(p_studio_id,p_historical_fx),
      'calculations',public.get_finance_source_calculations(p_studio_id));
  -- Completeness is inspected even without posting. Existing exception/approval rules remain in force.
  select min(day) into first_day from (
    select date_trunc('month',(c->>'date')::date)::date as day from jsonb_array_elements(report->'calculations') c
    union all select date_trunc('month',(c->>'periodStart')::date)::date from jsonb_array_elements(report->'historicalLabor'->'periods') c
    union all select min(month) from public.finance_report_coverage where studio_id=p_studio_id
    union all select (report->>'recognitionStart')::date
    union all select date_trunc('month',now() at time zone 'Europe/Kyiv')::date
  ) boundaries;
  select coalesce(jsonb_agg((e.state-'facts')||jsonb_build_object('revision',coalesce(c.revision,0),'confirmationId',c.id,
    'changed',c.id is not null and c.source_digest<>e.state->>'digest',
    'status',case when c.source_digest=e.state->>'digest' and jsonb_array_length(e.state->'exceptions')=0 then 'confirmed'
      when jsonb_array_length(e.state->'exceptions')>0 or c.id is not null then 'needs_review' else 'provisional' end) order by periods.day),'[]') into months
    from generate_series(first_day::timestamp,(now() at time zone 'Europe/Kyiv')::date::timestamp,interval '1 month') periods(day)
    cross join lateral(select private.finance_month_evidence(p_studio_id,periods.day::date,report) as state) e
    left join lateral(select c.* from public.finance_month_confirmations c where c.studio_id=p_studio_id and c.month=periods.day::date order by c.revision desc limit 1) c on true;
  return report||jsonb_build_object('months',months);
end $$;
revoke all on function public.get_finance_management_reporting(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_management_reporting(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
