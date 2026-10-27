-- Labor setup resolves operational defaults from existing Finance and studio
-- state. An internal-project exclusion is optional; null means every task and
-- review project with tracked time participates in normal allocation.
alter table public.finance_labor_automation
  alter column internal_project_id drop not null;

-- Reuse exact reviewed term evidence across unrelated setup changes, and ask
-- again only when a relevant term's evidence has changed.
create or replace function private.finance_labor_source_review(p_studio uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare recurring jsonb; digest text; term jsonb; classified jsonb:='[]'; unresolved jsonb:='[]'; cash_ids jsonb:='[]';
begin
  select coalesce(jsonb_agg(jsonb_build_object('termId',t.id,'scheduleId',t.schedule_id,'name',t.name,
    'category',c.name,'categoryId',c.id,'categoryKey',c.default_key,'intervalMonths',t.interval_months,'amount',t.amount::text,'currency',t.currency,'effectiveFrom',t.effective_from,
    'effectiveThrough',t.valid_through,'stoppedFrom',s.stopped_from) order by t.id),'[]') into recurring
    from public.finance_schedule_history t join public.finance_schedules s on s.studio_id=t.studio_id and s.id=t.schedule_id
    join public.finance_categories c on c.studio_id=t.studio_id and c.id=t.category_id
    where t.studio_id=p_studio and s.kind='recurring' and (c.default_key in ('salary','employee_bonus','employer_costs')
      or exists(select 1 from public.finance_schedule_terms prior
        join public.finance_categories pc on pc.studio_id=prior.studio_id and pc.id=prior.category_id
        where prior.studio_id=t.studio_id and prior.schedule_id=t.schedule_id
          and pc.default_key in ('salary','employee_bonus','employer_costs'))
      or exists(select 1 from public.finance_schedule_terms prior
        join public.finance_planning_requests r on r.studio_id=prior.studio_id
          and r.payload->>'operation'='labor_capacity' and r.payload->'input'->>'payrollSourcesConfirmed'='true'
          and r.payload->'input'->'payrollCashTermIds' ? prior.id::text
        where prior.studio_id=t.studio_id and prior.schedule_id=t.schedule_id))
      and coalesce(least(t.valid_through,s.stopped_from-1),'infinity'::date)>=coalesce((select recognition_start_month from public.finance_settings where studio_id=p_studio),date_trunc('month',now() at time zone 'Europe/Kyiv')::date);
  digest:=md5(coalesce((select jsonb_agg(x-'name'-'category' order by x->>'termId') from jsonb_array_elements(recurring) x),'[]')::text);
  for term in select value from jsonb_array_elements(recurring) loop
    if exists(select 1 from public.finance_planning_requests r
      where r.studio_id=p_studio and r.payload->>'operation'='labor_capacity'
        and r.payload->'input'->>'payrollSourcesConfirmed'='true'
        and r.payload->'input'->'payrollCashTermIds' ? (term->>'termId'))
      or exists(select 1 from public.finance_planning_requests r
      where r.studio_id=p_studio and r.payload->>'operation'='labor_capacity'
        and r.payload->'input'->>'payrollSourcesConfirmed'='true'
        and ((r.payload->'input'->>'payrollSourceDigest'=digest or exists(select 1 from private.finance_labor_review_digest_aliases a
              where a.studio_id=p_studio and a.legacy_digest=r.payload->'input'->>'payrollSourceDigest' and a.payroll_digest=digest))
          or exists(select 1 from jsonb_array_elements(coalesce(r.payload->'input'->'payrollSourceTerms','[]')) saved
            where (saved-'hasRecognizedExpense'-'name'-'category'-'effectiveThrough')=(term-'name'-'category'-'effectiveThrough'))))
      or exists(select 1 from public.finance_recognized_actuals e
        join public.finance_obligation_items i on i.studio_id=e.studio_id and i.expected_item_id=private.finance_recognition_expected_root(e.studio_id,e.expected_item_id)
        join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
        where e.studio_id=p_studio and o.terms_id=(term->>'termId')::uuid group by o.terms_id having sum(e.amount)>0) then
      classified:=classified||jsonb_build_array(term->'termId');
      if exists(select 1 from public.finance_planning_requests r
        where r.studio_id=p_studio and r.payload->>'operation'='labor_capacity'
          and r.payload->'input'->>'payrollSourcesConfirmed'='true'
          and r.payload->'input'->'payrollCashTermIds' ? (term->>'termId')) then
        cash_ids:=cash_ids||jsonb_build_array(term->'termId');
      end if;
    else unresolved:=unresolved||jsonb_build_array(term->'termId');end if;
  end loop;
  select coalesce(jsonb_agg(t||jsonb_build_object('hasRecognizedExpense',exists(
    select 1 from public.finance_recognized_actuals e
    join public.finance_obligation_items i on i.studio_id=e.studio_id and i.expected_item_id=private.finance_recognition_expected_root(e.studio_id,e.expected_item_id)
    join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
    where e.studio_id=p_studio and o.terms_id=(t->>'termId')::uuid group by o.terms_id having sum(e.amount)>0)) order by t->>'termId'),'[]') into recurring
    from jsonb_array_elements(recurring) t;
  select coalesce(jsonb_agg(distinct entry.value order by entry.value),'[]') into cash_ids
    from public.finance_planning_requests r
    cross join lateral jsonb_array_elements(coalesce(r.payload->'input'->'payrollCashTermIds','[]')) entry(value)
    where r.studio_id=p_studio and r.payload->>'operation'='labor_capacity'
      and r.payload->'input'->>'payrollSourcesConfirmed'='true';
  return jsonb_build_object('digest',digest,'reviewed',jsonb_array_length(unresolved)=0,'recurring',recurring,
    'cashTermIds',cash_ids,'classifiedTermIds',classified,'unresolvedTermIds',unresolved);
end $$;
revoke all on function private.finance_labor_source_review(uuid) from public,anon,authenticated,service_role;

-- The reporting core's `internal_classification` issue was an obsolete setup
-- gate. Null exclusion now means all tracked task/review projects are eligible.
do $$
declare fn text; updated text;
begin
  fn:=pg_get_functiondef('private.finance_labor_reporting_core(uuid,jsonb,boolean,jsonb)'::regprocedure);
  updated:=replace(fn,
    $needle$    if cfg.internal_project_id is null and jsonb_array_length(basis->'projectIds')>0 then issues:=issues||jsonb_build_array('internal_classification');end if;
$needle$,'');
  if updated=fn then raise exception 'finance_labor_internal_classification_gate_not_found';end if;
  execute updated;
end $$;

create function private.finance_labor_setup_capacity_proposal(p_studio uuid,p_input jsonb,p_capacity_from date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare employee uuid:=nullif(p_input->>'employeeId','')::uuid; minutes integer; days integer[]; source text;
begin
  if p_capacity_from is null then raise exception 'finance_input_invalid';end if;
  if (p_input ? 'dailyMinutes') is distinct from (p_input ? 'weekdays') then raise exception 'finance_input_invalid';end if;
  if p_input ? 'dailyMinutes' then
    minutes:=(p_input->>'dailyMinutes')::integer;
    if minutes is null or minutes<=0 then raise exception 'finance_input_invalid';end if;
    if jsonb_typeof(p_input->'weekdays') is distinct from 'array' then raise exception 'finance_input_invalid';end if;
    select array_agg(distinct value::integer order by value::integer) into days from jsonb_array_elements_text(p_input->'weekdays');
    days:=coalesce(days,'{}'::integer[]);
    if array_position(days,null) is not null or exists(select 1 from unnest(days) d where d not between 1 and 7) then raise exception 'finance_input_invalid';end if;
    source:='input';
  else
    select c.daily_minutes,c.weekdays into minutes,days from public.finance_labor_capacity_revisions c
      where c.studio_id=p_studio and c.effective_from<=p_capacity_from and (c.employee_id is null or c.employee_id=employee)
      order by (c.employee_id is not null) desc,c.effective_from desc,c.created_at desc,c.id desc limit 1;
    if minutes is not null then source:='saved';
    else
      select standard_workday_minutes into minutes from public.studios where id=p_studio;
      days:=array[1,2,3,4,5];source:='studio_default';
    end if;
  end if;
  return jsonb_build_object('employeeId',employee,'effectiveFrom',p_capacity_from,'dailyMinutes',minutes,'weekdays',to_jsonb(days),'source',source);
end $$;
revoke all on function private.finance_labor_setup_capacity_proposal(uuid,jsonb,date) from public,anon,authenticated,service_role;

alter function public.preview_finance_labor_activation(uuid,jsonb) rename to preview_finance_labor_activation_before_simplification;
alter function public.preview_finance_labor_activation_before_simplification(uuid,jsonb) set schema private;
revoke all on function private.preview_finance_labor_activation_before_simplification(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.preview_finance_labor_activation(p_studio_id uuid,p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; capacity_from date; proposal jsonb; costs jsonb; allocations jsonb; project uuid; digest_state jsonb; recognition_start date;
begin
  result:=private.preview_finance_labor_before_posting_info(p_studio_id,p_input);
  if p_input ? 'capacityFrom' then capacity_from:=(p_input->>'capacityFrom')::date;
  elsif p_input ? 'dailyMinutes' then capacity_from:=(p_input->>'effectiveFrom')::date;
  elsif exists(select 1 from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id
      and c.effective_from<=(result->>'capacityFrom')::date and (c.employee_id is null or c.employee_id=nullif(p_input->>'employeeId','')::uuid)) then
    capacity_from:=(result->>'capacityFrom')::date;
  else capacity_from:=greatest((p_input->>'effectiveFrom')::date,(now() at time zone 'Europe/Kyiv')::date);end if;
  proposal:=private.finance_labor_setup_capacity_proposal(p_studio_id,p_input,capacity_from);
  if p_input ? 'internalProjectId' then project:=nullif(p_input->>'internalProjectId','')::uuid;
  else project:=(private.finance_labor_configuration(p_studio_id)).internal_project_id;end if;
  if project is not null and not exists(select 1 from public.projects where studio_id=p_studio_id and id=project) then raise exception 'finance_input_invalid';end if;
  proposal:=proposal||jsonb_build_object('internalProjectId',project);
  costs:=private.finance_labor_reporting_core(p_studio_id,'{}',true,proposal);
  costs:=jsonb_set(costs,'{periods}',coalesce((select jsonb_agg(p) from jsonb_array_elements(costs->'periods') p
    where (p->>'periodEnd')::date>=capacity_from),'[]'));
  select coalesce(jsonb_agg(to_jsonb(a) order by a.entry_id,a.project_id),'[]') into allocations
    from public.finance_current_labor_allocations a where a.studio_id=p_studio_id;
  select coalesce((recognition_enabled_at at time zone 'Europe/Kyiv')::date,recognition_start_month) into recognition_start
    from public.finance_settings where studio_id=p_studio_id;
  result:=result||jsonb_build_object('capacityFrom',capacity_from,'capacityProposal',proposal,'costPreview',costs,
    'recognitionStart',recognition_start,'historicalCapacityRequired',p_input ? 'capacityFrom'
      and capacity_from<(now() at time zone 'Europe/Kyiv')::date
      and not exists(select 1 from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id
        and c.effective_from<=capacity_from and (c.employee_id is null or c.employee_id=nullif(p_input->>'employeeId','')::uuid)));
  digest_state:=result||jsonb_build_object('input',p_input-'previewDigest','allocations',allocations);
  return result||jsonb_build_object('digest',md5(digest_state::text));
end $$;
revoke all on function public.preview_finance_labor_activation(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_finance_labor_activation(uuid,jsonb) to authenticated;

alter function public.configure_finance_labor_automation(uuid,uuid,jsonb) rename to configure_finance_labor_automation_before_simplification;
alter function public.configure_finance_labor_automation_before_simplification(uuid,uuid,jsonb) set schema private;
revoke all on function private.configure_finance_labor_automation_before_simplification(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.configure_finance_labor_automation(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare preview jsonb; proposal jsonb; review jsonb; normalized jsonb; payload jsonb; prior public.finance_planning_requests;
  cfg public.finance_labor_automation; starts date; employee uuid; capacity_from date; project uuid; existing_capacity public.finance_labor_capacity_revisions;
  cash_ids jsonb; term_id uuid; result uuid; previous_starts date;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.studio_members where studio_id=p_studio_id order by user_id for share;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  select * into prior from public.finance_planning_requests where studio_id=p_studio_id and request_id=p_request_id;
  if prior.request_id is not null then
    if prior.payload->>'operation' is distinct from 'labor_capacity'
      or coalesce(prior.payload->'requestInput',prior.payload->'input') is distinct from p_input then raise exception 'finance_request_conflict';end if;
    return prior.result_id;
  end if;
  if p_request_id is null then raise exception 'finance_input_invalid';end if;
  starts:=(p_input->>'effectiveFrom')::date;
  employee:=nullif(p_input->>'employeeId','')::uuid;
  preview:=public.preview_finance_labor_activation(p_studio_id,p_input-'previewDigest');
  if p_input->>'previewDigest' is distinct from preview->>'digest' then raise exception 'finance_preview_required';end if;
  capacity_from:=(preview->>'capacityFrom')::date;
  proposal:=preview->'capacityProposal';
  review:=private.finance_labor_source_review(p_studio_id);
  if p_input ? 'payrollSourceDigest' or p_input ? 'payrollCashTermIds' then
    if p_input->>'payrollSourceDigest' is distinct from review->>'digest'
      or jsonb_typeof(p_input->'payrollCashTermIds') is distinct from 'array' then raise exception 'finance_payroll_source_review_required';end if;
    select coalesce(jsonb_agg(distinct id order by id),'[]') into cash_ids from (
      select value as id from jsonb_array_elements(review->'cashTermIds')
      union select value from jsonb_array_elements(p_input->'payrollCashTermIds')
    ) choices;
    for term_id in select value::uuid from jsonb_array_elements_text(p_input->'payrollCashTermIds') value
      where not (review->'cashTermIds' ? value) loop
      if not exists(select 1 from jsonb_array_elements(review->'recurring') t where t->>'termId'=term_id::text) then raise exception 'finance_input_invalid';end if;
      if exists(select 1 from public.finance_recognized_actuals e
        join public.finance_obligation_items i on i.studio_id=e.studio_id and i.expected_item_id=private.finance_recognition_expected_root(e.studio_id,e.expected_item_id)
        join public.finance_obligations o on o.studio_id=i.studio_id and o.id=i.obligation_id
        where e.studio_id=p_studio_id and o.terms_id=term_id group by o.terms_id having sum(e.amount)>0) then
        raise exception 'finance_payroll_source_history_conflict';end if;
    end loop;
  else
    if not (review->>'reviewed')::boolean then raise exception 'finance_payroll_source_review_required';end if;
    cash_ids:=review->'cashTermIds';
  end if;
  normalized:=p_input||jsonb_build_object('payrollSourceDigest',review->>'digest','payrollCashTermIds',cash_ids,
    'payrollSourcesConfirmed',true,'payrollSourceTerms',review->'recurring');
  payload:=jsonb_build_object('operation','labor_capacity','input',normalized,'requestInput',p_input);
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result;end if;
  cfg:=private.finance_labor_configuration(p_studio_id);
  project:=nullif(p_input->>'internalProjectId','')::uuid;
  if not (p_input ? 'internalProjectId') then project:=cfg.internal_project_id;end if;
  if project is not null and not exists(select 1 from public.projects where studio_id=p_studio_id and id=project) then raise exception 'finance_input_invalid';end if;
  if cfg.studio_id is null then
    if employee is not null then raise exception 'finance_input_invalid';end if;
    insert into public.finance_labor_automation(studio_id,starts_on,internal_project_id,created_by)
      values(p_studio_id,starts,project,auth.uid());
  else
    if p_input ? 'internalProjectId' and project is distinct from cfg.internal_project_id then raise exception 'finance_input_invalid';end if;
    if coalesce((p_input->>'changeActivation')::boolean,false) then
      if employee is not null then raise exception 'finance_input_invalid';end if;
      select starts_on into previous_starts from public.finance_labor_activation_revisions where studio_id=p_studio_id order by created_at desc,id desc limit 1;
      previous_starts:=coalesce(previous_starts,cfg.starts_on);
      if starts>previous_starts and exists(select 1 from public.finance_labor_calculations where studio_id=p_studio_id and status='applied') then raise exception 'finance_history_protected';end if;
      insert into public.finance_labor_activation_revisions(studio_id,starts_on,previous_starts_on,preview_digest,created_by)
        values(p_studio_id,starts,previous_starts,p_input->>'previewDigest',auth.uid());
    end if;
  end if;
  if employee is not null and not exists(select 1 from public.studio_members where studio_id=p_studio_id and user_id=employee) then raise exception 'finance_input_invalid';end if;
  select c.* into existing_capacity from public.finance_labor_capacity_revisions c
    where c.studio_id=p_studio_id and c.effective_from<=capacity_from and (c.employee_id is null or c.employee_id=employee)
    order by (c.employee_id is not null) desc,c.effective_from desc,c.created_at desc,c.id desc limit 1;
  if existing_capacity.id is null
    or existing_capacity.daily_minutes<>(proposal->>'dailyMinutes')::integer
    or array(select d from unnest(existing_capacity.weekdays) d order by d)
      is distinct from array(select value::integer from jsonb_array_elements_text(proposal->'weekdays') order by 1) then
    insert into public.finance_labor_capacity_revisions(studio_id,employee_id,effective_from,daily_minutes,weekdays,created_by)
      values(p_studio_id,employee,capacity_from,(proposal->>'dailyMinutes')::integer,
        array(select value::integer from jsonb_array_elements_text(proposal->'weekdays')),auth.uid()) returning id into result;
  else result:=gen_random_uuid();end if;
  insert into public.finance_planning_requests(studio_id,request_id,payload,result_id,created_by,created_at)
    values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
revoke all on function public.configure_finance_labor_automation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.configure_finance_labor_automation(uuid,uuid,jsonb) to authenticated;




-- The core read has a legacy mutable-membership precheck. Keep dated per-day
-- employment as the authority and remove only that stale precheck result.
do $$
declare fn text; updated text;
begin
  fn:=pg_get_functiondef('private.finance_labor_period_basis(uuid,public.finance_obligations,public.finance_labor_automation,jsonb,jsonb,text,jsonb)'::regprocedure);
  updated:=replace(fn,
    $needle$  if member.joined_at is null or (member.joined_at at time zone 'Europe/Kyiv')::date>o.period_start or member.removed_at is not null and (member.removed_at at time zone 'Europe/Kyiv')::date<=o.period_end then
    issues:=array_append(issues,'partial_employment');end if;
$needle$,'');
  if updated=fn then raise exception 'finance_labor_membership_precheck_not_found';end if;
  execute updated;
end $$;


notify pgrst,'reload schema';
