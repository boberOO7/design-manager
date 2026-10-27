-- Design contracts have no effective date by constraint. They must still participate
-- in earning-plan completeness; retain the existing earning-event month scope wrapper.
create or replace function private.finance_month_evidence_before_event_scope(p_studio uuid,p_month date,p_report jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare last_day date:=(p_month+interval '1 month - 1 day')::date; through date:=least(last_day,(now() at time zone 'Europe/Kyiv')::date);
  facts jsonb; issues jsonb; categories jsonb;
begin
  with evidence as (
    select 'entries' as kind,coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') as items
      from public.finance_recognition_entries e where e.studio_id=p_studio and e.recognized_on between p_month and through
    union all select 'orders',coalesce(jsonb_agg(o-'earned'-'unearned'-'hasRecognition' order by o->>'orderId'),'[]')
      from jsonb_array_elements(p_report->'earnings'->'orders') o where exists(select 1 from public.finance_project_terms t
        where t.studio_id=p_studio and t.order_id=(o->>'orderId')::uuid and (t.effective_from is null or t.effective_from<=through))
    union all select 'milestones',coalesce(jsonb_agg(m order by m->>'id'),'[]') from jsonb_array_elements(p_report->'earnings'->'milestones') m
      where exists(select 1 from jsonb_array_elements(m->'events') e where (e->>'date')::date between p_month and through)
    union all select 'laborSources',coalesce(jsonb_agg(s order by s->>'obligationId'),'[]') from jsonb_array_elements(p_report->'labor'->'sources') s
      where (s->>'periodStart')::date<=through and (s->>'periodEnd')::date>=p_month
    union all select 'laborPeriods',coalesce(jsonb_agg(s order by s->>'obligationId'),'[]') from jsonb_array_elements(p_report->'labor'->'automaticPeriods') s
      where (s->>'periodStart')::date<=through and (s->>'periodEnd')::date>=p_month
    union all select 'missingLabor',coalesce(jsonb_agg(s order by s::text),'[]') from jsonb_array_elements(p_report->'labor'->'missingPeriods') s
      where (s->>'periodStart')::date<=through and (s->>'periodEnd')::date>=p_month
    union all select 'laborIssues',coalesce(jsonb_agg(distinct s order by s),'[]') from jsonb_array_elements(p_report->'labor'->'projectIssues') s
      where (s->>'periodStart')::date<=through and (s->>'periodEnd')::date>=p_month
    union all select 'uncoveredWork',coalesce(jsonb_agg(jsonb_build_object('employeeId',w.user_id,'date',w.work_date,'id',w.id) order by w.id),'[]')
      from public.work_log_entries w where w.studio_id=p_studio and w.work_date between p_month and through
        and not exists(select 1 from public.finance_obligations o where o.studio_id=w.studio_id and o.employee_id=w.user_id
          and o.kind='payroll' and w.work_date between o.period_start and o.period_end)
    union all select 'allocations',coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.finance_labor_allocation_revisions a
      join public.finance_recognition_entries e on e.studio_id=a.studio_id and e.id=a.entry_id
      where a.studio_id=p_studio and e.recognized_on between p_month and through
    union all select 'expenses',coalesce(jsonb_agg(s order by s->>'sourceId',s->>'month'),'[]') from jsonb_array_elements(p_report->'expenseAutomation'->'candidates') s
      where (s->>'to')::date between p_month and through
    union all select 'receipts',coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.finance_expense_receipts r
      where r.studio_id=p_studio and r.occurred_on between p_month and through
    union all select 'trips',coalesce(jsonb_agg(s order by s->>'id'),'[]') from jsonb_array_elements(p_report->'tripSources') s
      where (s->>'date')::date between p_month and through
    union all select 'recurring',coalesce(jsonb_agg(jsonb_build_object('scheduleId',s.id,'label',t.name,'termId',t.id,
      'policy',to_jsonb(p),'period',d::date,'obligationId',o.id) order by s.id,d),'[]')
      from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
      join public.finance_categories c on c.studio_id=t.studio_id and c.id=t.category_id
      cross join lateral generate_series(t.effective_from::timestamp,through::timestamp,make_interval(months=>t.interval_months)) d
      left join public.finance_obligations o on o.studio_id=s.studio_id and o.schedule_id=s.id and o.period_start=d::date
      left join lateral(select p.* from public.finance_expense_service_policies p where p.studio_id=s.studio_id and p.schedule_id=s.id
        and p.first_period<=d::date order by p.first_period desc,p.revision desc limit 1) p on true
      where s.studio_id=p_studio and s.kind='recurring' and c.nature='operating' and coalesce(c.default_key,'') not in ('salary','employee_bonus')
        and d::date<=coalesce(least(t.valid_through,s.stopped_from-1),'infinity'::date)
        and (d+make_interval(months=>t.interval_months)-interval '1 day')::date>=p_month
        and not exists(select 1 from public.finance_obligation_items oi where oi.studio_id=s.studio_id and oi.obligation_id=o.id
          and private.finance_labor_cash_expected(s.studio_id,oi.expected_item_id))
  ) select jsonb_object_agg(kind,items) into facts from evidence;
  with problems as (
    select 'revenue' as category,o->>'orderId' as id,o->>'orderId' as label,'earning_configuration' as reason,
      '/projects/'||(o->>'projectId')||'?view=finance' as href
      from jsonb_array_elements(facts->'orders') o where not (o->>'configured')::boolean or not (o->>'complete')::boolean or (o->>'stale')::boolean
    union all select 'revenue',m->>'id',m->>'title',coalesce(m->>'exception','earning_unprocessed'),'/projects/'||(m->>'project_id')||'?view=finance'
      from jsonb_array_elements(facts->'milestones') m where (m->>'exception' is not null or not (m->>'recognized')::boolean)
        and exists(select 1 from jsonb_array_elements(m->'events') e where e->>'kind'=m->>'condition' and (e->>'date')::date>=p_month and (e->>'date')::date<=through)
    union all select 'labor',s->>'obligationId',s->>'label','labor_source','/finance/reports#labor'
      from jsonb_array_elements(facts->'laborSources') s where not (s->>'sourceReady')::boolean or (s->>'remainingCost')::numeric<>0
        or s->>'employerStatus'<>'fixed' or s->>'basis'='net' and s->>'deductionsStatus'<>'fixed'
    union all select 'labor',s->>'obligationId',s->>'label',coalesce(i.reason,'labor_'||(s->>'status')),'/finance/reports#labor'
      from jsonb_array_elements(facts->'laborPeriods') s left join lateral jsonb_array_elements_text(s->'issues') i(reason) on true
      where (s->>'status' not in ('applied','manual') or i.reason is not null) and not private.finance_labor_known_zero(s)
    union all select 'labor',s->>'scheduleId',s->>'label','missing_labor_period','/finance/schedules'
      from jsonb_array_elements(facts->'missingLabor') s
    union all select 'labor',s->>'employeeId',s->>'employeeId',s->>'kind','/finance/reports#labor'
      from jsonb_array_elements(facts->'laborIssues') s
    union all select 'labor',s->>'employeeId',coalesce((select full_name from public.profiles where id=(s->>'employeeId')::uuid),s->>'employeeId'),
      'missing_payroll','/team/'||(s->>'employeeId') from jsonb_array_elements(facts->'uncoveredWork') s
    union all select case when s->>'projectId' is null then 'overhead' else 'direct_cost' end,s->>'sourceId',s->>'label',
      coalesce(s->>'issue','expense_pending'),'/finance/schedules#expense-automation' from jsonb_array_elements(facts->'expenses') s
    union all select case when s->>'projectId' is null then 'overhead' else 'direct_cost' end,s->>'id',s->>'description','trip_pending','/finance/trips/'||(s->>'tripId')
      from jsonb_array_elements(facts->'trips') s
    union all select e.classification,e.id::text,e.description,'missing_fx','/finance/reports#fx-history'
      from public.finance_recognized_actuals e where e.studio_id=p_studio and e.recognized_on between p_month and through and e.reporting_amount is null
    union all select coalesce(case when s->'policy'->>'project_id' is null then 'overhead' else 'direct_cost' end,'overhead'),
      s->>'scheduleId',s->>'label','missing_expense_period','/finance/schedules#expense-automation'
      from jsonb_array_elements(facts->'recurring') s where s->>'obligationId' is null
    union all select case when r.project_id is null then 'overhead' else 'direct_cost' end,r.id::text,coalesce(r.snapshot->>'label',r.id::text),
      'receipt_unprocessed',case when r.expected_item_id is not null then '/finance/expected?item='||r.expected_item_id else '/finance/movements?movement='||r.movement_id end
      from public.finance_expense_receipts r where r.studio_id=p_studio and r.occurred_on between p_month and through
        and not exists(select 1 from public.finance_recognition_entries e where e.studio_id=p_studio and e.expense_receipt_id=r.id)
  ) select coalesce(jsonb_agg(distinct jsonb_build_object('category',category,'sourceId',id,'label',label,'reason',reason,'href',href)),'[]') into issues from problems;
  select jsonb_object_agg(category,case when exists(select 1 from jsonb_array_elements(issues) i where i->>'category'=category) then 'incomplete'
    when category='revenue' and jsonb_array_length(facts->'orders')>0 then 'automatic'
    when category='labor' and jsonb_array_length(facts->'laborSources')>0 then 'automatic'
    when category in ('direct_cost','overhead') and exists(select 1 from public.finance_recognized_actuals e join public.finance_recognition_entries r on r.id=e.id and r.studio_id=e.studio_id where e.studio_id=p_studio
      and e.recognized_on between p_month and through and e.classification=category and (r.expense_policy_id is not null or r.expense_receipt_id is not null or r.trip_entry_id is not null))
      and not exists(select 1 from jsonb_array_elements(facts->'recurring') s where s->'policy'->>'policy' is null or s->'policy'->>'policy'='manual') then 'automatic'
    else 'manual' end) into categories from unnest(array['revenue','direct_cost','labor','overhead']) category;
  return jsonb_build_object('month',p_month,'through',through,'closed',last_day<(now() at time zone 'Europe/Kyiv')::date,
    'digest',md5(facts::text),'facts',facts,'categories',categories,'exceptions',issues);
end $$;
revoke all on function private.finance_month_evidence_before_event_scope(uuid,date,jsonb) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
