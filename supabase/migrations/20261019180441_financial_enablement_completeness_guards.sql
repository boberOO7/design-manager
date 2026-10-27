create or replace function public.get_finance_source_calculations(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; services jsonb; base text;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select base_currency into base from public.finance_settings where studio_id=p_studio_id;
  select coalesce(jsonb_agg(jsonb_build_object('id','service:'||(c->>'sourceId')||':'||(c->>'month'),'sourceId',c->>'sourceId',
    'classification',case when c->>'projectId' is null then 'overhead' else 'direct_cost' end,'date',c->>'to','projectId',c->>'projectId',
    'currency',c->>'currency','amount',case when c->>'issue' is null or c->>'issue'='history_protected' then c->>'amount' end,
    'reportingAmount',null,'reportingCurrency',base,'ownerId',c->'policy'->>'schedule_id','label',c->>'label','issue',c->>'issue','href','/finance/schedules?expense='||(c->'policy'->>'schedule_id'))),'[]') into services
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
    'ownerId',case when id like 'earning:%' then (select milestone_id::text from public.finance_project_earning_events where studio_id=p_studio_id and id=source_id) else source_id::text end,'currency',currency,'amount',amount::text,'reportingAmount',reporting_amount::text,'reportingCurrency',reporting_currency,'label',label,'issue',issue,'href',href) order by day,id),'[]') into rows from calculations;
  return services||rows;
end $$;
revoke all on function public.get_finance_source_calculations(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_source_calculations(uuid) to authenticated;
alter function private.finance_month_evidence(uuid,date,jsonb) rename to finance_month_evidence_before_calculations;
create function private.finance_month_evidence(p_studio uuid,p_month date,p_report jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare state jsonb; facts jsonb; calculations jsonb; labor jsonb; issues jsonb; categories jsonb;
begin
  state:=private.finance_month_evidence_before_calculations(p_studio,p_month,p_report);
  select coalesce(jsonb_agg(c order by c->>'id'),'[]') into calculations from jsonb_array_elements(coalesce(p_report->'calculations','[]')) c
    where (c->>'date')::date between p_month and (state->>'through')::date;
  select coalesce(jsonb_agg(c order by c->>'sourceKey'),'[]') into labor from jsonb_array_elements(coalesce(p_report->'historicalLabor'->'periods','[]')) c
    where (c->>'periodEnd')::date between p_month and (state->>'through')::date;
  facts:=(state->'facts')||jsonb_build_object('sourceCalculations',calculations,'calculatedLabor',labor);
  -- Posting status alone is not a missing business fact. Only exact, conflict-free evidence can satisfy it.
  select coalesce(jsonb_agg(issue),'[]') into issues from jsonb_array_elements(state->'exceptions') issue
    where not ((issue->>'reason' in ('earning_unprocessed','finance_recognition_inactive','finance_input_invalid','expense_pending','receipt_unprocessed','trip_pending','missing_expense_period')
      and exists(select 1 from jsonb_array_elements(calculations) c where c->>'ownerId'=issue->>'sourceId' and c->>'amount' is not null and c->>'issue' is null
        and (c->>'currency'=c->>'reportingCurrency' or c->>'reportingAmount' is not null)))
      or (issue->>'reason' in ('labor_source','labor_pending','labor_exception','labor_pending_review') and exists(select 1 from jsonb_array_elements(labor) c
        where c->>'obligationId'=issue->>'sourceId' and c->>'calculatedCost' is not null and jsonb_array_length(c->'issues')=0)));
  issues:=issues||coalesce((select jsonb_agg(jsonb_build_object('category',c->>'classification','sourceId',c->>'sourceId','label',c->>'label',
    'reason',coalesce(c->>'issue',case when c->>'amount' is null then 'source_unavailable' else 'missing_fx' end),'href',c->>'href'))
    from jsonb_array_elements(calculations) c where c->>'issue' is not null or c->>'amount' is null
      or c->>'currency'<>c->>'reportingCurrency' and c->>'reportingAmount' is null),'[]');
  issues:=issues||coalesce((select jsonb_agg(jsonb_build_object('category','labor','sourceId',c->>'sourceKey','label',c->>'label',
    'reason',reason,'href','/finance/reports#labor')) from jsonb_array_elements(labor) c cross join lateral jsonb_array_elements_text(c->'issues') reason),'[]');
  select jsonb_object_agg(category,case when exists(select 1 from jsonb_array_elements(issues) i where i->>'category'=category) then 'incomplete'
    else state->'categories'->>category end) into categories from unnest(array['revenue','direct_cost','labor','overhead']) category;
  return state||jsonb_build_object('facts',facts,'digest',md5(facts::text),'exceptions',issues,'categories',categories);
end $$;
revoke all on function private.finance_month_evidence(uuid,date,jsonb) from public,anon,authenticated,service_role;

create or replace function public.confirm_finance_month(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','confirm_month','input',p_input); result uuid; evidence jsonb; report jsonb;
  month_date date:=(p_input->>'month')::date; boundary date; prior integer; coverage_revision integer; coverage uuid;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio_id;
  if month_date is null or month_date<>date_trunc('month',month_date)::date
    or (month_date+interval '1 month')::date>(now() at time zone 'Europe/Kyiv')::date
    or p_input->>'approved' is distinct from 'true' then raise exception 'finance_input_invalid';end if;
  report:=public.get_finance_management_reporting(p_studio_id);
  evidence:=private.finance_month_evidence(p_studio_id,month_date,report);
  if evidence->>'digest' is distinct from p_input->>'digest' then raise exception 'finance_version_conflict';end if;
  if jsonb_array_length(evidence->'exceptions')>0 then raise exception 'finance_month_exceptions';end if;
  select coalesce(max(revision),0) into prior from public.finance_month_confirmations where studio_id=p_studio_id and month=month_date;
  if prior is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  select coalesce(max(revision),0) into coverage_revision from public.finance_report_coverage where studio_id=p_studio_id and project_id is null and month=month_date;
  insert into public.finance_report_coverage(studio_id,month,reviewed_through,revenue_reviewed,direct_costs_reviewed,labor_reviewed,overhead_reviewed,revision,reason,created_by)
    values(p_studio_id,month_date,(month_date+interval '1 month - 1 day')::date,true,true,true,true,coverage_revision+1,'Monthly source and external completeness approval',auth.uid()) returning id into coverage;
  insert into public.finance_month_confirmations(studio_id,month,revision,source_digest,snapshot,coverage_id,created_by)
    values(p_studio_id,month_date,prior+1,evidence->>'digest',evidence,coverage,auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

create or replace function public.preview_finance_labor_activation(p_studio_id uuid,p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare starts date:=(p_input->>'effectiveFrom')::date; employee uuid:=nullif(p_input->>'employeeId','')::uuid;
  cfg public.finance_labor_automation; boundary date; periods jsonb; result jsonb; state jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  cfg:=private.finance_labor_configuration(p_studio_id);
  select recognition_start_month into boundary from public.finance_settings where studio_id=p_studio_id and finalized_at is not null;
  boundary:=coalesce(boundary,starts);
  if starts is null then raise exception 'finance_input_invalid';end if;
  with candidates as (
    select s.employee_id,p.full_name as label,m::date as period_start,
      least((m+make_interval(months=>t.interval_months)-interval '1 day')::date,t.valid_through) as period_end,t.id as terms_id,
      t.currency,case when t.basis='gross' then t.amount else coalesce(t.employee_payout,t.amount)+coalesce(t.employee_deductions,0) end
        +case when t.employer_cost_status='fixed' then coalesce(t.employer_cost,0) else 0 end as known
    from public.finance_schedules s join public.profiles p on p.id=s.employee_id
    cross join lateral generate_series(date_trunc('month',starts),date_trunc('month',greatest(starts,(now() at time zone 'Europe/Kyiv')::date)),interval '1 month') m
    cross join lateral (select h.* from public.finance_schedule_history h where h.studio_id=s.studio_id and h.schedule_id=s.id
      and h.effective_from<=m::date and (h.valid_through is null or h.valid_through>=m::date) order by h.revision desc limit 1) t
    where s.studio_id=p_studio_id and s.kind='payroll' and (employee is null or s.employee_id=employee)
      and ((extract(year from m)-extract(year from t.effective_from))*12+extract(month from m)-extract(month from t.effective_from))::integer%t.interval_months=0
  ), affected as (
    select c.employee_id,c.label,c.period_start,coalesce(o.period_end,c.period_end) as period_end,o.id,
      coalesce((private.finance_labor_source(p_studio_id,o.id)->>'knownCost')::numeric,c.known) as known,coalesce(private.finance_labor_source(p_studio_id,o.id)->>'currency',c.currency) as currency
    from candidates c left join public.finance_obligations o on o.studio_id=p_studio_id and o.employee_id=c.employee_id and o.kind='payroll' and o.period_start=c.period_start
    union select o.employee_id,o.employee_name,o.period_start,o.period_end,o.id,
      (private.finance_labor_source(p_studio_id,o.id)->>'knownCost')::numeric,private.finance_labor_source(p_studio_id,o.id)->>'currency'
      from public.finance_obligations o where o.studio_id=p_studio_id and o.kind in ('payroll','bonus')
      and o.period_end>=starts and o.period_start<=(now() at time zone 'Europe/Kyiv')::date and (employee is null or o.employee_id=employee)
  ) select coalesce(jsonb_agg(jsonb_build_object('employeeId',a.employee_id,'label',a.label,'periodStart',a.period_start,'periodEnd',a.period_end,
    'knownCost',a.known::text,'currency',a.currency,
    'recognizedCost',coalesce((select sum(e.amount) from public.finance_recognition_entries e where e.studio_id=p_studio_id and e.obligation_id=a.id),0)::text,
    'manual',exists(select 1 from public.finance_labor_allocation_revisions r join public.finance_recognition_entries e on e.studio_id=r.studio_id and e.id=r.entry_id
      where e.studio_id=p_studio_id and e.obligation_id=a.id and r.method='manual_management'),
    'protected',exists(select 1 from public.finance_report_coverage c where c.studio_id=p_studio_id and c.labor_reviewed and a.period_end between c.month and c.reviewed_through),
    'completedDays',(select count(*) from public.work_log_days w where w.studio_id=p_studio_id and w.user_id=a.employee_id and w.work_date between greatest(starts,a.period_start) and least(a.period_end,(now() at time zone 'Europe/Kyiv')::date)))
    order by a.period_start,a.employee_id,a.id),'[]') into periods from affected a;
  result:=jsonb_build_object('startsOn',starts,'capacityFrom',case when cfg.studio_id is null or coalesce((p_input->>'changeActivation')::boolean,false) and not exists(
      select 1 from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id and c.employee_id is null and c.effective_from<=date_trunc('month',starts)::date)
      then date_trunc('month',starts)::date else starts end,
    'recognitionStart',boundary,'existingAutomationStart',cfg.starts_on,'periods',periods);
  -- Bind the preview to source/evidence changes as well as the requested settings.
  state:=jsonb_build_object(
    'capacity',(select jsonb_agg(to_jsonb(c) order by c.id) from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id),
    'terms',(select jsonb_agg(to_jsonb(t) order by t.id) from public.finance_schedule_history t where t.studio_id=p_studio_id),
    'sources',(select jsonb_agg(private.finance_labor_source(p_studio_id,o.id) order by o.id) from public.finance_obligations o where o.studio_id=p_studio_id and o.period_end>=starts),
    'reports',(select jsonb_agg(to_jsonb(w) order by w.user_id,w.work_date) from public.work_log_days w where w.studio_id=p_studio_id and w.work_date>=starts),
    'work',(select jsonb_agg(to_jsonb(w) order by w.id) from public.work_log_entries w where w.studio_id=p_studio_id and w.work_date>=starts));
  return result||jsonb_build_object('digest',md5((result||jsonb_build_object('input',p_input-'previewDigest','state',state))::text));
end $$;

alter function public.prepare_finance_automatic_labor(uuid) rename to prepare_finance_automatic_labor_before_enablement;
alter function public.prepare_finance_automatic_labor_before_enablement(uuid) set schema private;
revoke all on function private.prepare_finance_automatic_labor_before_enablement(uuid) from public,anon,authenticated,service_role;
create function public.prepare_finance_automatic_labor(p_studio_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=private.prepare_finance_automatic_labor_before_enablement(p_studio_id);
  return coalesce((select jsonb_agg(c) from jsonb_array_elements(result) c join public.finance_obligations o on o.studio_id=(c->>'studioId')::uuid and o.id=(c->>'obligationId')::uuid
    where private.finance_posting_eligible(o.studio_id,o.period_start)),'[]');
end $$;
revoke all on function public.prepare_finance_automatic_labor(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_finance_automatic_labor(uuid) to authenticated,service_role;

alter function public.process_finance_automatic_labor(uuid,uuid,text,jsonb,uuid,boolean) rename to process_finance_automatic_labor_before_enablement;
alter function public.process_finance_automatic_labor_before_enablement(uuid,uuid,text,jsonb,uuid,boolean) set schema private;
revoke all on function private.process_finance_automatic_labor_before_enablement(uuid,uuid,text,jsonb,uuid,boolean) from public,anon,authenticated,service_role;
create function public.process_finance_automatic_labor(p_studio_id uuid,p_obligation_id uuid,p_digest text,p_fx jsonb default null,p_request_id uuid default gen_random_uuid(),p_approve boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' and not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if not exists(select 1 from public.finance_obligations where studio_id=p_studio_id and id=p_obligation_id and private.finance_posting_eligible(studio_id,period_start)) then return null;end if;
  return private.process_finance_automatic_labor_before_enablement(p_studio_id,p_obligation_id,p_digest,p_fx,p_request_id,p_approve);
end $$;
revoke all on function public.process_finance_automatic_labor(uuid,uuid,text,jsonb,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.process_finance_automatic_labor(uuid,uuid,text,jsonb,uuid,boolean) to authenticated,service_role;
notify pgrst,'reload schema';
