-- Preserve existing unrecognized labor completeness during open service periods,
-- scoped only to the source employee and affected projects. Recognition stays closed-period guarded.
create or replace function public.get_finance_labor_reporting(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; cfg public.finance_labor_automation; periods jsonb; issues jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  result:=private.get_finance_labor_reporting_base(p_studio_id);
  select * into cfg from public.finance_labor_automation where studio_id=p_studio_id;
  select coalesce(jsonb_agg(basis||jsonb_build_object('status',case when (basis->>'manual')::boolean then 'manual'
    when c.digest=basis->>'digest' then c.status when c.id is not null then 'pending' else 'pending' end) order by o.period_start,o.employee_name,o.id),'[]') into periods
  from public.finance_obligations o cross join lateral (select private.finance_automatic_labor_basis(o.studio_id,o.id) as basis) b
  left join lateral (select * from public.finance_labor_calculations where studio_id=o.studio_id and obligation_id=o.id order by created_at desc,id desc limit 1) c on true
  where o.studio_id=p_studio_id and o.kind in ('payroll','bonus') and o.period_start>=cfg.starts_on and o.period_start<=(now() at time zone 'Europe/Kyiv')::date;
  -- Each warning carries its owning project. Studio-wide missingness never
  -- contaminates another employee's unrelated project result.
  with automatic as (
    select p from jsonb_array_elements(periods) p where not (p->>'manual')::boolean
  ), scoped as (
    select p,j.value as project_id,'missing_reports'::text as kind from automatic cross join lateral jsonb_array_elements_text(p->'missingProjectIds') j
    union all select p,j.value,k.value from automatic cross join lateral jsonb_array_elements_text(p->'projectIds') j
      cross join lateral jsonb_array_elements_text(p->'issues') k where k.value<>'outside_schedule'
    union all select p,j.value,'payroll_source' from automatic cross join lateral jsonb_array_elements_text(p->'projectIds') j
      where (p->'source'->>'remainingCost')::numeric<>0
    union all select p,j.value,'pending_review' from automatic cross join lateral jsonb_array_elements_text(p->'projectIds') j
      where p->>'status' in ('pending','pending_review') and (p->>'periodEnd')::date<(now() at time zone 'Europe/Kyiv')::date
    union all select p,j.value->>'projectId','outside_schedule' from automatic cross join lateral jsonb_array_elements(p->'outsideSchedule') j
  ), source_issues as (
    select s from jsonb_array_elements(result->'sources') s where
      not (s->>'sourceReady')::boolean or (s->>'remainingCost')::numeric<>0
      or (s->>'basis'='net' and s->>'deductionsStatus'<>'fixed') or s->>'employerStatus'<>'fixed' or exists(select 1 from public.finance_labor_cost_pools pool where pool.studio_id=p_studio_id and pool.obligation_id=(s->>'obligationId')::uuid and pool.available_reporting_amount is null)
  ), legacy as (
    select distinct s,project_id from source_issues cross join lateral (
      select i.project_id from public.finance_labor_allocation_items i join public.finance_labor_allocation_revisions r on r.studio_id=i.studio_id and r.id=i.revision_id
        join public.finance_recognition_entries e on e.studio_id=r.studio_id and e.id=r.entry_id
        where e.studio_id=p_studio_id and e.obligation_id=(s->>'obligationId')::uuid
      union select private.finance_employee_projects_on_day(p_studio_id,(s->>'employeeId')::uuid,d::date)
        from generate_series((s->>'periodStart')::timestamp,least((s->>'periodEnd')::date,(now() at time zone 'Europe/Kyiv')::date)::timestamp,interval '1 day') d
      union select t.project_id from public.work_log_entries w join public.tasks t on t.id=w.task_id
        where w.studio_id=p_studio_id and w.user_id=(s->>'employeeId')::uuid
          and w.work_date between (s->>'periodStart')::date and (s->>'periodEnd')::date
    ) projects where not exists(select 1 from automatic where p->>'obligationId'=s->>'obligationId')
  ), all_issues as (
    select jsonb_build_object('projectId',project_id,'employeeId',p->>'employeeId','periodStart',p->>'periodStart','periodEnd',p->>'periodEnd','kind',kind) as issue from scoped where not (private.finance_labor_known_zero(p) and kind in ('missing_reports','missing_capacity','outside_schedule','pending_review'))
    union select jsonb_build_object('projectId',project_id,'employeeId',s->>'employeeId','periodStart',s->>'periodStart','periodEnd',s->>'periodEnd','kind','payroll_source') from legacy
    union select jsonb_build_object('projectId',t.project_id,'employeeId',w.user_id,'periodStart',date_trunc('month',w.work_date)::date,
      'periodEnd',(date_trunc('month',w.work_date)+interval '1 month - 1 day')::date,'kind','missing_payroll')
      from public.work_log_entries w join public.tasks t on t.id=w.task_id where w.studio_id=p_studio_id and w.work_date>=cfg.starts_on
      and not exists(select 1 from public.finance_obligations o where o.studio_id=w.studio_id and o.employee_id=w.user_id and o.kind='payroll' and w.work_date between o.period_start and o.period_end)
    union select jsonb_build_object('projectId',project_id,'employeeId',schedule.employee_id,'periodStart',m->>'periodStart','periodEnd',m->>'periodEnd','kind','missing_payroll_period')
      from jsonb_array_elements(result->'missingPeriods') m join public.finance_schedules schedule on schedule.id=(m->>'scheduleId')::uuid and schedule.studio_id=p_studio_id
      cross join lateral (select distinct private.finance_employee_projects_on_day(p_studio_id,schedule.employee_id,d::date) as project_id
        from generate_series((m->>'periodStart')::timestamp,(m->>'periodEnd')::timestamp,interval '1 day') d) projects
  ) select coalesce(jsonb_agg(distinct issue) filter(where issue->>'projectId' is distinct from cfg.internal_project_id::text),'[]') into issues from all_issues;
  return result||jsonb_build_object('automation',case when cfg.studio_id is null then null else jsonb_build_object('startsOn',cfg.starts_on,'internalProjectId',cfg.internal_project_id) end,
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.full_name) order by p.full_name,m.user_id) from public.studio_members m join public.profiles p on p.id=m.user_id where m.studio_id=p_studio_id and m.is_active and p.is_active),'[]'),
    'capacity',coalesce((select jsonb_agg(to_jsonb(c) order by c.effective_from,c.created_at,c.id) from public.finance_labor_capacity_revisions c where c.studio_id=p_studio_id),'[]'),
    'automaticPeriods',periods,'projectIssues',issues);
end $$;




notify pgrst,'reload schema';
