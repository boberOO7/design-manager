-- Monthly payroll earnings share the existing obligation, settlement and labor books.
alter table public.finance_schedule_terms
  add column pay_method text not null default 'fixed' check (pay_method in ('fixed','per_m2')),
  add column rate_per_m2 numeric,
  alter column amount drop not null,
  drop constraint finance_schedule_terms_check2,
  add constraint finance_payroll_method_check check (
    (pay_method='fixed' and amount is not null and rate_per_m2 is null and (
      (basis is null and employee_payout is null and employee_deductions is null and employer_cost is null)
      or (basis is not null and employee_payout is not null and interval_months=1 and commitment='agreed' and certainty='fixed'
        and ((basis='net' and amount=employee_payout)
          or (basis='gross' and employee_deductions is not null and amount=employee_payout+employee_deductions)))))
    or (pay_method='per_m2' and amount is null and employee_payout is null and basis is not null
      and rate_per_m2 is not null and rate_per_m2>0 and rate_per_m2<=9999999999.9999 and rate_per_m2=round(rate_per_m2,4)
      and interval_months=1 and commitment='agreed' and certainty='fixed'
      and (basis='net' or employee_deductions is not null)));

create or replace view public.finance_schedule_history with(security_invoker=true) as
 SELECT t.id,
    t.studio_id,
    t.schedule_id,
    t.revision,
    t.name,
    t.amount,
    t.currency,
    t.category_id,
    t.interval_months,
    t.payout_day,
    t.payment_month_offset,
    t.effective_from,
    t.effective_through,
    t.commitment,
    t.certainty,
    t.basis,
    t.employee_payout,
    t.employee_deductions,
    t.employer_cost,
    t.employer_cost_status,
    t.reason,
    t.created_by,
    t.created_at,
    LEAST(t.effective_through, s.stopped_from - 1, lead(t.effective_from) OVER (PARTITION BY t.studio_id, t.schedule_id ORDER BY t.revision) - 1) AS valid_through, t.pay_method, t.rate_per_m2
   FROM finance_schedule_terms t
     JOIN finance_schedules s ON s.studio_id = t.studio_id AND s.id = t.schedule_id;

create table public.finance_payroll_earning_revisions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  obligation_id uuid not null,
  revision integer not null check(revision>0),
  terms_id uuid not null,
  schedule_id uuid not null,
  source_digest text not null check(source_digest ~ '^[a-f0-9]{32}$'),
  source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
  calculated_amount numeric not null check(calculated_amount>=0 and calculated_amount<=9999999999.9999),
  adjustment_amount numeric not null,
  final_amount numeric not null check(final_amount>=0 and final_amount<=9999999999.9999),
  employee_payout numeric not null check(employee_payout>=0 and employee_payout<=9999999999.9999),
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,obligation_id,revision),
  foreign key(studio_id,obligation_id) references public.finance_obligations(studio_id,id) on delete restrict,
  foreign key(studio_id,terms_id,schedule_id) references public.finance_schedule_terms(studio_id,id,schedule_id) on delete restrict,
  check(final_amount=calculated_amount+adjustment_amount)
);
create index finance_payroll_earning_terms_idx on public.finance_payroll_earning_revisions(studio_id,terms_id,schedule_id);
create index finance_payroll_earning_creator_idx on public.finance_payroll_earning_revisions(created_by);
alter table public.finance_payroll_earning_revisions enable row level security;
revoke all on public.finance_payroll_earning_revisions from public,anon,authenticated,service_role;
grant select on public.finance_payroll_earning_revisions to authenticated;
create policy finance_payroll_earning_admin on public.finance_payroll_earning_revisions for select to authenticated
  using((select private.is_finance_admin(studio_id)));
create trigger finance_payroll_earning_immutable before update or delete on public.finance_payroll_earning_revisions
  for each row execute function private.reject_finance_history_change();

-- Use the same active attribution rows and project accounting flag as productivity.
create function private.finance_payroll_period_basis(p_studio uuid,p_obligation uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.finance_obligations; t public.finance_schedule_terms; sources jsonb:='[]'; area numeric:=0;
  calculated numeric; digits integer; snapshot jsonb;
begin
  select * into o from public.finance_obligations where studio_id=p_studio and id=p_obligation and kind='payroll';
  if not found then raise exception 'finance_obligation_invalid';end if;
  select * into t from public.finance_schedule_terms where studio_id=p_studio and id=o.terms_id;
  select minor_units into digits from public.finance_currencies where code=t.currency;
  if t.pay_method='per_m2' then
    select coalesce(sum(a.credited_area_m2),0),coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'projectId',a.project_id,'taskId',a.task_id,'projectName',p.name,'taskTitle',task.title,
      'stage',a.task_stage,'sourceType',a.source_type,'completedAt',a.completed_at,'area',a.credited_area_m2::text)
      order by a.completed_at,a.id),'[]') into area,sources
    from public.productivity_attributions a
    left join public.projects p on p.studio_id=a.studio_id and p.id=a.project_id
    left join public.tasks task on task.project_id=a.project_id and task.id=a.task_id
    where a.studio_id=p_studio and a.contributor_id=o.employee_id and a.voided_at is null
      and a.completed_at>=o.period_start::timestamp at time zone 'Europe/Kyiv'
      and a.completed_at<(o.period_end+1)::timestamp at time zone 'Europe/Kyiv'
      and a.credited_area_m2>0 and coalesce(p.include_in_productivity,true);
    calculated:=round(area*t.rate_per_m2,digits);
  else calculated:=t.amount;end if;
  snapshot:=jsonb_build_object('termsId',t.id,'payMethod',t.pay_method,'rate',t.rate_per_m2::text,
    'currency',t.currency,'basis',t.basis,'periodStart',o.period_start,'periodEnd',o.period_end,
    'area',area::text,'calculatedAmount',calculated::text,'sources',sources);
  return snapshot||jsonb_build_object('digest',md5(snapshot::text));
end $$;

CREATE OR REPLACE FUNCTION private.finance_payroll_term_consumed(p_studio uuid, p_term uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.finance_obligations o where o.studio_id=p_studio and o.terms_id=p_term and (
    exists(select 1 from public.finance_payroll_earning_revisions r where r.studio_id=o.studio_id and r.obligation_id=o.id)
    or exists(select 1 from public.finance_recognition_entries r where r.studio_id=o.studio_id and r.obligation_id=o.id)
    or exists(select 1 from public.finance_payroll_cost_revisions r where r.studio_id=o.studio_id and r.obligation_id=o.id)
    or exists(select 1 from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where l.studio_id=o.studio_id and l.obligation_id=o.id and (i.is_established or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id)))
  ));
$function$;

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
  if p_input->>'kind'='payroll' and coalesce(p_input->>'payMethod','fixed')='per_m2' then
    if nullif(p_input->>'amount','') is not null or nullif(p_input->>'employeePayout','') is not null then raise exception 'finance_compensation_invalid';end if;
    if nullif(p_input->>'ratePerM2','') is null then raise exception 'finance_amount_invalid';end if;
  elsif coalesce(p_input->>'payMethod','fixed')<>'fixed' or nullif(p_input->>'ratePerM2','') is not null then raise exception 'finance_compensation_invalid';end if;
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
    and not private.finance_payroll_term_consumed(p_studio_id,prior.id)
    and not ((prior.pay_method='per_m2' or coalesce(p_input->>'payMethod','fixed')='per_m2') and starts>prior.effective_from);
  if editable then
    select * into anchor from public.finance_schedule_terms t
      where t.studio_id=p_studio_id and t.schedule_id=schedule.id
        and t.revision>coalesce((select max(h.revision) from public.finance_schedule_terms h
          where h.studio_id=p_studio_id and h.schedule_id=schedule.id
            and private.finance_payroll_term_consumed(p_studio_id,h.id)),0)
      order by t.revision limit 1;
    if prior.pay_method='per_m2' or coalesce(p_input->>'payMethod','fixed')='per_m2' then anchor:=prior;end if;
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
          or exists(select 1 from public.finance_payroll_earning_revisions r where r.studio_id=o.studio_id and r.obligation_id=o.id)
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
  foreach value in array array[nullif(p_input->>'amount','')::numeric,nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,nullif(p_input->>'employerCost','')::numeric] loop
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
  insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,effective_through,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by,pay_method,rate_per_m2)
  values(p_studio_id,schedule.id,coalesce(prior.revision,0)+case when editable then 0 else 1 end,btrim(p_input->>'name'),nullif(p_input->>'amount','')::numeric,p_input->>'currency',category.id,
    (p_input->>'intervalMonths')::integer,(p_input->>'payoutDay')::integer,coalesce((p_input->>'paymentMonthOffset')::integer,0),starts,nullif(p_input->>'effectiveThrough','')::date,
    p_input->>'commitment',p_input->>'certainty',nullif(p_input->>'basis',''),nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,
    case when p_input ? 'employerCost' then nullif(p_input->>'employerCost','')::numeric
      when schedule.kind='payroll' and prior.id is null and not(p_input ? 'employerCostStatus') then 0
      else prior.employer_cost end,
    coalesce(p_input->>'employerCostStatus',prior.employer_cost_status,case when schedule.kind='payroll' then 'fixed' else 'unknown' end),btrim(p_input->>'reason'),auth.uid(),coalesce(p_input->>'payMethod','fixed'),nullif(p_input->>'ratePerM2','')::numeric)
  on conflict(studio_id,schedule_id,revision) do update set
    name=excluded.name,amount=excluded.amount,currency=excluded.currency,category_id=excluded.category_id,
    interval_months=excluded.interval_months,payout_day=excluded.payout_day,payment_month_offset=excluded.payment_month_offset,
    effective_from=excluded.effective_from,effective_through=excluded.effective_through,
    commitment=excluded.commitment,certainty=excluded.certainty,basis=excluded.basis,
    employee_payout=excluded.employee_payout,employee_deductions=excluded.employee_deductions,
    employer_cost=excluded.employer_cost,employer_cost_status=excluded.employer_cost_status,reason=excluded.reason,pay_method=excluded.pay_method,rate_per_m2=excluded.rate_per_m2;
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

create function private.finance_payroll_payout_authorized(p_studio uuid,p_item uuid,p_amount numeric) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(current_setting('studioflow.finance_payroll_earning',true),'')='on' and exists(
    select 1 from public.finance_obligation_items l
    join lateral (select r.employee_payout from public.finance_payroll_earning_revisions r
      where r.studio_id=l.studio_id and r.obligation_id=l.obligation_id order by r.revision desc limit 1) earning on true
    where l.studio_id=p_studio and l.expected_item_id=p_item and l.component='payout' and earning.employee_payout=p_amount)
$$;

CREATE OR REPLACE FUNCTION private.guard_finance_obligation_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare component text;
begin
  if private.finance_payroll_payout_authorized(old.studio_id,old.id,new.amount)
    and row(new.direction,new.currency,new.category_id,new.due_date) is not distinct from row(old.direction,old.currency,old.category_id,old.due_date)
    and new.certainty='fixed' and new.commitment='agreed' and new.is_established then return new;end if;
  if current_setting('studioflow.finance_occurrence_reconcile',true)='on' then return new; end if;
  select l.component into component from public.finance_obligation_items l where l.studio_id=old.studio_id and l.expected_item_id=old.id;
  if component is null then return new; end if;
  if component='payout' and (new.commitment<>'agreed' or not new.is_established)
    and exists(select 1 from public.finance_obligation_items l join public.finance_payroll_earning_revisions r
      on r.studio_id=l.studio_id and r.obligation_id=l.obligation_id where l.studio_id=old.studio_id and l.expected_item_id=old.id)
    then raise exception 'finance_obligation_locked';end if;
  if component='payout' and new.is_established and exists(select 1 from public.finance_obligation_items l
    join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
    join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
    where l.studio_id=old.studio_id and l.expected_item_id=old.id and t.pay_method='per_m2'
      and not exists(select 1 from public.finance_payroll_earning_revisions r where r.studio_id=o.studio_id and r.obligation_id=o.id))
    then raise exception 'finance_payroll_confirmation_required';end if;
  if row(new.amount,new.certainty,new.commitment) is distinct from row(old.amount,old.certainty,old.commitment)
    and exists(select 1 from public.finance_obligation_items l join public.finance_payroll_cost_revisions r
      on r.studio_id=l.studio_id and r.obligation_id=l.obligation_id and r.component=l.component
      where l.studio_id=old.studio_id and l.expected_item_id=old.id)
  then raise exception 'finance_payroll_cost_locked'; end if;
  if row(new.direction,new.currency,new.category_id,new.due_date) is distinct from row(old.direction,old.currency,old.category_id,old.due_date)
    or (component in ('payout','deductions','bonus') and row(new.amount,new.certainty) is distinct from row(old.amount,old.certainty)) then raise exception 'finance_obligation_locked'; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.set_finance_expected_vat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare digits integer; parts record;
begin
  select minor_units into digits from public.finance_currencies where code=new.currency;
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  if tg_op='UPDATE' and exists(select 1 from public.finance_allocations where studio_id=old.studio_id and expected_item_id=old.id)
    and row(new.amount,new.currency,new.vat_rate,new.price_basis,new.net_amount,new.vat_amount)
      is distinct from row(old.amount,old.currency,old.vat_rate,old.price_basis,old.net_amount,old.vat_amount)
    and not (private.finance_payroll_payout_authorized(old.studio_id,old.id,new.amount)
      and new.currency=old.currency and new.vat_rate is null and old.vat_rate is null)
    and not (
      coalesce(current_setting('studioflow.trip_reconcile',true),'')='on'
      and new.currency=old.currency and new.vat_rate is null and old.vat_rate is null and new.price_basis is null and old.price_basis is null
      and (exists(select 1 from public.finance_trip_entry_values e where e.studio_id=old.studio_id and e.expected_item_id=old.id
          and e.currency=new.currency and e.net_amount=new.amount)
        or exists(
          select 1 from public.finance_trip_balances b join public.finance_trips t on t.studio_id=b.studio_id and t.id=b.trip_id
          cross join lateral (select coalesce(sum(e.net_amount) filter(where e.kind='expense'),0) as spent,
            coalesce(sum(e.net_amount) filter(where e.kind='advance'),0) as advanced
            from public.finance_trip_entry_values e where e.studio_id=b.studio_id and e.trip_id=b.trip_id and e.employee_id=b.employee_id and e.currency=b.currency) cost
          cross join lateral (select coalesce(sum(a.amount) filter(where x.direction='outgoing'),0) as paid_out,
            coalesce(sum(a.amount) filter(where x.direction='incoming'),0) as paid_in
            from public.finance_trip_balances x left join public.finance_allocations a on a.studio_id=x.studio_id and a.expected_item_id=x.expected_item_id
            where x.studio_id=b.studio_id and x.trip_id=b.trip_id and x.employee_id=b.employee_id and x.currency=b.currency) paid
          where b.studio_id=old.studio_id and b.expected_item_id=old.id and b.currency=new.currency
            and new.amount=case when b.direction='outgoing' then paid.paid_out+greatest(cost.spent-cost.advanced-paid.paid_out+paid.paid_in,0)
              else paid.paid_in+case when t.status in ('completed','cancelled') then greatest(-(cost.spent-cost.advanced-paid.paid_out+paid.paid_in),0) else 0 end end
        ))
    ) then raise exception 'finance_project_settled_terms_locked'; end if;
  if new.vat_rate is null then
    new.price_basis:=null; new.net_amount:=new.amount; new.vat_amount:=0;
  elsif new.vat_rate<0 or new.vat_rate<>round(new.vat_rate,4) or new.price_basis not in ('net','gross') then
    raise exception 'finance_project_vat_invalid';
  elsif tg_op='INSERT' or (new.amount is distinct from old.amount and (new.net_amount,new.vat_amount) is not distinct from (old.net_amount,old.vat_amount)) then
    select * into parts from private.finance_vat_parts(new.amount,new.vat_rate,'gross',digits);
    new.net_amount:=parts.net_amount; new.vat_amount:=parts.vat_amount;
  elsif new.net_amount+new.vat_amount<>new.amount then
    raise exception 'finance_project_vat_invalid';
  end if;
  return new;
end;
$function$;

alter table public.finance_expected_items drop constraint finance_expected_items_amount_check,
  add constraint finance_expected_items_amount_check check(amount>=0 and amount<=9999999999.9999);
create function private.guard_finance_zero_payroll_payout() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.amount=0 and not private.finance_payroll_payout_authorized(new.studio_id,new.id,new.amount) then
    if tg_op='INSERT' or new.amount is distinct from old.amount then raise exception 'finance_amount_invalid';end if;
  end if;
  return new;
end $$;
create trigger finance_zero_payroll_payout before insert or update on public.finance_expected_items
  for each row execute function private.guard_finance_zero_payroll_payout();

CREATE OR REPLACE FUNCTION private.reconcile_finance_schedule_occurrences(p_studio uuid, p_schedule uuid, p_from date, p_through date, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare schedule public.finance_schedules; terms public.finance_schedule_history; obligation public.finance_obligations;
  period date; v_period_end date; due_month date; v_due date; months integer;
  v_employee_name text; cost_category uuid; desired text[]; protected boolean; primary_active boolean;
  basis jsonb; payroll_amount numeric;
  previous_reconcile text:=current_setting('studioflow.finance_occurrence_reconcile',true);
begin
  if p_from is null or p_through is null or extract(day from p_from)<>1 or extract(day from p_through)<>1 or p_through<p_from then
    raise exception 'finance_schedule_range';
  end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio and id=p_schedule for update;
  if schedule.id is null then raise exception 'finance_schedule_invalid'; end if;
  select full_name into v_employee_name from public.profiles where id=schedule.employee_id;
  select id into cost_category from public.finance_categories
    where studio_id=p_studio and default_key='employer_costs' and archived_at is null;
  perform set_config('studioflow.finance_occurrence_reconcile','on',true);

  for period in
    select generate_series(p_from::timestamp,p_through::timestamp,interval '1 month')::date
    union
    select o.period_start from public.finance_obligations o
      join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
      where o.studio_id=p_studio and o.schedule_id=p_schedule
        and (o.period_start>p_through or t.pay_method='per_m2' and o.period_start<p_from)
    order by 1
  loop
    terms:=null; obligation:=null; desired:=array[]::text[];
    select * into terms from public.finance_schedule_history
      where studio_id=p_studio and schedule_id=p_schedule and effective_from<=period
        and (valid_through is null or period<=valid_through)
      order by revision desc limit 1;
    if terms.id is not null then
      months:=(extract(year from period)-extract(year from terms.effective_from))::integer*12
        +(extract(month from period)-extract(month from terms.effective_from))::integer;
      if months%terms.interval_months<>0 then terms:=null; end if;
    end if;

    select * into obligation from public.finance_obligations
      where studio_id=p_studio and schedule_id=p_schedule and period_start=period;
    -- A schedule without applicable terms may only maintain its own occurrences.
    if obligation.id is null and schedule.kind='payroll' and terms.id is not null then
      select * into obligation from public.finance_obligations
        where studio_id=p_studio and employee_id=schedule.employee_id and kind='payroll' and period_start=period;
    end if;

    if obligation.id is not null then
      select exists(
        select 1 from public.finance_obligation_items l
        join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
        where l.studio_id=p_studio and l.obligation_id=obligation.id
          and ((schedule.kind<>'payroll' and i.is_established)
            or exists(select 1 from public.finance_allocations a where a.studio_id=i.studio_id and a.expected_item_id=i.id))
      ) into protected;
      if (period<date_trunc('month',now() at time zone 'Europe/Kyiv')::date and current_setting('studioflow.finance_payroll_draft_edit',true)<>'on' and coalesce(terms.pay_method,'fixed')<>'per_m2') or protected
        or exists(select 1 from public.finance_payroll_earning_revisions r where r.studio_id=p_studio and r.obligation_id=obligation.id)
        or exists(select 1 from public.finance_payroll_cost_revisions r where r.studio_id=p_studio and r.obligation_id=obligation.id) then continue; end if;
    end if;

    -- Reuse only a stopped predecessor's system-cancelled, unprotected occurrence.
    -- The employee/month identity survives, but ownership transfers exactly once.
    if obligation.id is not null and obligation.schedule_id<>schedule.id then
      if not exists(select 1 from public.finance_schedules predecessor
        where predecessor.studio_id=p_studio and predecessor.id=obligation.schedule_id
          and predecessor.stopped_from<=period)
        or exists(select 1 from public.finance_obligation_items l
          where l.studio_id=p_studio and l.obligation_id=obligation.id and l.managed_active)
      then continue; end if;
    end if;

    if terms.id is null then
      if obligation.id is not null and obligation.schedule_id=schedule.id then
        update public.finance_expected_items i set commitment='cancelled',is_established=false,version=i.version+1,updated_at=now()
          from public.finance_obligation_items l
          where l.studio_id=p_studio and l.obligation_id=obligation.id and l.expected_item_id=i.id and l.managed_active;
        update public.finance_obligation_items set managed_active=false
          where studio_id=p_studio and obligation_id=obligation.id and managed_active;
      end if;
      continue;
    end if;

    if obligation.id is not null then
      select exists(select 1 from public.finance_obligation_items where studio_id=p_studio and obligation_id=obligation.id
        and component=case when schedule.kind='payroll' then 'payout' else 'recurring' end and managed_active) into primary_active;
      if obligation.schedule_id=schedule.id and obligation.terms_id=terms.id and primary_active
        and current_setting('studioflow.finance_payroll_draft_edit',true)<>'on' and terms.pay_method<>'per_m2' then continue; end if;
    end if;

    v_period_end:=least((period+make_interval(months=>terms.interval_months)-interval '1 day')::date,terms.valid_through);
    due_month:=(period+make_interval(months=>terms.payment_month_offset))::date;
    v_due:=least(due_month+terms.payout_day-1,(due_month+interval '1 month - 1 day')::date);
    if obligation.id is null then
      insert into public.finance_obligations(studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
        values(p_studio,schedule.id,terms.id,schedule.kind,schedule.employee_id,v_employee_name,period,v_period_end,coalesce(p_actor,schedule.created_by))
        returning * into obligation;
    else
      update public.finance_obligations set schedule_id=schedule.id,terms_id=terms.id,employee_name=coalesce(v_employee_name,obligation.employee_name),period_end=v_period_end
        where studio_id=p_studio and id=obligation.id returning * into obligation;
    end if;

    if terms.pay_method='per_m2' then
      basis:=private.finance_payroll_period_basis(p_studio,obligation.id);
      payroll_amount:=case when period<=date_trunc('month',now() at time zone 'Europe/Kyiv')::date then (basis->>'calculatedAmount')::numeric else 0 end;
      if terms.basis='gross' then payroll_amount:=greatest(0,payroll_amount-terms.employee_deductions);end if;
      -- No invented zero/future payments, including optional payroll components.
      if payroll_amount<=0 then
        with retired as (
          update public.finance_expected_items i set commitment='cancelled',is_established=false,version=i.version+1,updated_at=now()
            from public.finance_obligation_items l where l.studio_id=p_studio and l.obligation_id=obligation.id
            and l.expected_item_id=i.id and l.managed_active and i.commitment<>'cancelled' returning i.id
        ) update public.finance_obligation_items set managed_active=false
          where studio_id=p_studio and obligation_id=obligation.id and expected_item_id in (select id from retired);
        continue;
      end if;
    else payroll_amount:=coalesce(terms.employee_payout,terms.amount);end if;

    if terms.pay_method='per_m2' and exists(select 1 from public.finance_obligation_items l
      join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
      where l.studio_id=p_studio and l.obligation_id=obligation.id and l.component='payout' and l.managed_active
        and i.amount=payroll_amount and i.currency=terms.currency and i.due_date=v_due and i.category_id=terms.category_id) then continue;end if;
    desired:=array[case when schedule.kind='payroll' then 'payout' else 'recurring' end];
    perform private.reconcile_finance_obligation_item(p_studio,obligation.id,desired[1],payroll_amount,
      terms.currency,terms.category_id,terms.name||' · '||to_char(period,'YYYY-MM'),v_due,terms.commitment,case when terms.pay_method='per_m2' then 'estimated' else terms.certainty end,coalesce(p_actor,schedule.created_by));
    if terms.employee_deductions>0 then
      desired:=array_append(desired,'deductions');
      perform private.reconcile_finance_obligation_item(p_studio,obligation.id,'deductions',terms.employee_deductions,
        terms.currency,cost_category,terms.name||' · deductions · '||to_char(period,'YYYY-MM'),v_due,'agreed','fixed',coalesce(p_actor,schedule.created_by));
    end if;
    if terms.employer_cost>0 then
      desired:=array_append(desired,'employer_cost');
      perform private.reconcile_finance_obligation_item(p_studio,obligation.id,'employer_cost',terms.employer_cost,
        terms.currency,cost_category,terms.name||' · employer cost · '||to_char(period,'YYYY-MM'),v_due,'agreed',terms.employer_cost_status,coalesce(p_actor,schedule.created_by));
    end if;
    update public.finance_expected_items i set commitment='cancelled',is_established=false,version=i.version+1,updated_at=now()
      from public.finance_obligation_items l
      where l.studio_id=p_studio and l.obligation_id=obligation.id and l.expected_item_id=i.id and l.managed_active
        and not(l.component=any(desired));
    update public.finance_obligation_items set managed_active=false
      where studio_id=p_studio and obligation_id=obligation.id and managed_active and not(component=any(desired));
  end loop;
  perform set_config('studioflow.finance_occurrence_reconcile',coalesce(previous_reconcile,''),true);
end $function$;

create function public.get_finance_payroll_period(p_studio_id uuid,p_obligation_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.finance_obligations; basis jsonb; r public.finance_payroll_earning_revisions; paid numeric; payout uuid; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  basis:=private.finance_payroll_period_basis(p_studio_id,p_obligation_id);
  select * into o from public.finance_obligations where studio_id=p_studio_id and id=p_obligation_id;
  select * into r from public.finance_payroll_earning_revisions where studio_id=p_studio_id and obligation_id=o.id order by revision desc limit 1;
  select expected_item_id into payout from public.finance_obligation_items where studio_id=p_studio_id and obligation_id=o.id and component='payout';
  select coalesce(sum(amount),0) into paid from public.finance_allocations where studio_id=p_studio_id and expected_item_id=payout;
  result:=jsonb_build_object('obligationId',o.id,'scheduleId',o.schedule_id,'employeeName',o.employee_name,
    'periodStart',o.period_start,'periodEnd',o.period_end,'current',basis,'confirmed',case when r.id is null then null else
      jsonb_build_object('revision',r.revision,'source',r.source_snapshot,'calculatedAmount',r.calculated_amount::text,
        'adjustment',r.adjustment_amount::text,'finalAmount',r.final_amount::text,'payout',r.employee_payout::text,'reason',r.reason) end,
    'paid',paid::text,'expectedItemId',payout,'sourceChanged',r.id is not null and r.source_digest<>basis->>'digest',
    'history',coalesce((select jsonb_agg(jsonb_build_object('revision',h.revision,'source',h.source_snapshot,
      'calculatedAmount',h.calculated_amount::text,'adjustment',h.adjustment_amount::text,'finalAmount',h.final_amount::text,
      'payout',h.employee_payout::text,'reason',h.reason,'createdAt',h.created_at,'createdBy',h.created_by) order by h.revision desc)
      from public.finance_payroll_earning_revisions h where h.studio_id=p_studio_id and h.obligation_id=o.id),'[]'));
  return result;
end $$;

create function public.confirm_finance_payroll_earning(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','payroll_earning','input',p_input); result uuid;
  o public.finance_obligations; t public.finance_schedule_terms; prior public.finance_payroll_earning_revisions;
  live jsonb; basis jsonb; amount numeric; payout_amount numeric; deduction numeric; digits integer; item uuid; due date;
  previous_reconcile text:=current_setting('studioflow.finance_occurrence_reconcile',true);
  cost_category uuid; optional_component text; component_amount numeric;
  previous_earning text:=current_setting('studioflow.finance_payroll_earning',true);
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select * into o from public.finance_obligations where studio_id=p_studio_id and id=(p_input->>'obligationId')::uuid and kind='payroll' for update;
  if not found or o.period_start>date_trunc('month',now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_obligation_invalid';end if;
  select * into t from public.finance_schedule_terms where studio_id=p_studio_id and id=o.terms_id;
  select * into prior from public.finance_payroll_earning_revisions where studio_id=p_studio_id and obligation_id=o.id order by revision desc limit 1;
  if coalesce(prior.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict';end if;
  live:=private.finance_payroll_period_basis(p_studio_id,o.id);
  if live->>'digest' is distinct from p_input->>'digest' then raise exception 'finance_payroll_preview_stale';end if;
  if coalesce((p_input->>'refreshSource')::boolean,false) or prior.id is null then basis:=live;else basis:=prior.source_snapshot;end if;
  amount:=(p_input->>'finalAmount')::numeric;
  select minor_units into digits from public.finance_currencies where code=t.currency;
  if amount is null or amount<0 or amount>9999999999.9999 or amount<>round(amount,digits)
    or nullif(btrim(p_input->>'reason'),'') is null or char_length(btrim(p_input->>'reason'))>2000 then raise exception 'finance_amount_invalid';end if;
  select case when r.status='fixed' then r.amount else null end into deduction from public.finance_payroll_cost_revisions r
    where r.studio_id=p_studio_id and r.obligation_id=o.id and r.component='deductions' order by r.revision desc limit 1;
  if not found then deduction:=t.employee_deductions;end if;
  payout_amount:=case when t.basis='gross' then amount-deduction else amount end;
  if payout_amount is null or payout_amount<0 then raise exception 'finance_compensation_invalid';end if;
  insert into public.finance_payroll_earning_revisions(studio_id,obligation_id,revision,terms_id,schedule_id,source_digest,source_snapshot,
    calculated_amount,adjustment_amount,final_amount,employee_payout,reason,created_by)
  values(p_studio_id,o.id,coalesce(prior.revision,0)+1,t.id,t.schedule_id,basis->>'digest',basis,
    (basis->>'calculatedAmount')::numeric,amount-(basis->>'calculatedAmount')::numeric,amount,payout_amount,btrim(p_input->>'reason'),auth.uid()) returning id into result;
  select expected_item_id into item from public.finance_obligation_items where studio_id=p_studio_id and obligation_id=o.id and component='payout';
  perform set_config('studioflow.finance_payroll_earning','on',true);
  if item is null and payout_amount>0 then
    due:=least((o.period_start+make_interval(months=>t.payment_month_offset))::date+t.payout_day-1,
      (o.period_start+make_interval(months=>t.payment_month_offset+1)-interval '1 day')::date);
    item:=private.add_finance_obligation_item(p_studio_id,o.id,'payout',payout_amount,t.currency,t.category_id,t.name||' · '||to_char(o.period_start,'YYYY-MM'),due,'agreed','fixed');
  end if;
  if item is not null then
    update public.finance_expected_items set amount=payout_amount,certainty='fixed',commitment='agreed',is_established=true,version=version+1,updated_at=now()
      where studio_id=p_studio_id and id=item;
    -- managed_active is ownership metadata and uses the existing guarded reconciliation context.
    perform set_config('studioflow.finance_occurrence_reconcile','on',true);
    update public.finance_obligation_items set managed_active=true where studio_id=p_studio_id and expected_item_id=item;
    perform set_config('studioflow.finance_occurrence_reconcile',coalesce(previous_reconcile,''),true);
  end if;
  -- Components retain their own paid/completed history; add only missing known obligations.
  select id into cost_category from public.finance_categories where studio_id=p_studio_id and default_key='employer_costs' and archived_at is null;
  foreach optional_component in array array['deductions','employer_cost'] loop
    component_amount:=case when optional_component='deductions' then t.employee_deductions else t.employer_cost end;
    if component_amount>0 and not exists(select 1 from public.finance_obligation_items where studio_id=p_studio_id and obligation_id=o.id and component=optional_component) then
      due:=least((o.period_start+make_interval(months=>t.payment_month_offset))::date+t.payout_day-1,
        (o.period_start+make_interval(months=>t.payment_month_offset+1)-interval '1 day')::date);
      perform private.add_finance_obligation_item(p_studio_id,o.id,optional_component,component_amount,t.currency,cost_category,
        t.name||' · '||optional_component||' · '||to_char(o.period_start,'YYYY-MM'),due,'agreed',case when optional_component='deductions' then 'fixed' else t.employer_cost_status end);
    end if;
  end loop;
  perform set_config('studioflow.finance_payroll_earning',coalesce(previous_earning,''),true);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

CREATE OR REPLACE FUNCTION private.finance_labor_source(p_studio uuid, p_obligation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare obligation public.finance_obligations; terms public.finance_schedule_terms; payout public.finance_expected_items;
  deductions public.finance_payroll_cost_revisions; employer public.finance_payroll_cost_revisions;
  deductions_status text; employer_status text; deductions_value numeric; employer_value numeric;
  earning public.finance_payroll_earning_revisions; period_basis jsonb; wage numeric; ready boolean;
  known numeric; consumed numeric; snapshot jsonb; result jsonb; code text;
begin
  if not private.is_finance_admin(p_studio) and coalesce(auth.role(),'')<>'service_role' then raise exception 'finance_admin_required';end if;
  select * into obligation from public.finance_obligations where studio_id=p_studio and id=p_obligation and kind in ('payroll','bonus');
  if not found then return null; end if;
  select * into terms from public.finance_schedule_terms where studio_id=p_studio and id=obligation.terms_id;
  select i.* into payout from public.finance_obligation_items l join public.finance_expected_items i on i.studio_id=l.studio_id and i.id=l.expected_item_id
    where l.studio_id=p_studio and l.obligation_id=p_obligation and l.component in ('payout','bonus');
  select * into deductions from public.finance_payroll_cost_revisions where studio_id=p_studio and obligation_id=p_obligation and component='deductions' order by revision desc limit 1;
  select * into employer from public.finance_payroll_cost_revisions where studio_id=p_studio and obligation_id=p_obligation and component='employer_cost' order by revision desc limit 1;
  code:=coalesce(terms.currency,payout.currency);
  if code is null then return null; end if;
  deductions_status:=coalesce(deductions.status,case when terms.employee_deductions is null then 'unknown' else 'fixed' end);
  employer_status:=coalesce(employer.status,terms.employer_cost_status,'unknown');
  deductions_value:=case when deductions_status='fixed' then coalesce(deductions.amount,terms.employee_deductions,0) else 0 end;
  employer_value:=case when employer_status='fixed' then coalesce(employer.amount,terms.employer_cost,0) else 0 end;
  select * into earning from public.finance_payroll_earning_revisions where studio_id=p_studio and obligation_id=p_obligation order by revision desc limit 1;
  if obligation.kind='payroll' then
    if earning.id is not null then wage:=earning.final_amount;
    elsif terms.pay_method='per_m2' then period_basis:=private.finance_payroll_period_basis(p_studio,p_obligation);wage:=(period_basis->>'calculatedAmount')::numeric;
    else wage:=terms.amount;end if;
  end if;
  if obligation.kind='bonus' then
    known:=case when payout.commitment='agreed' and payout.certainty='fixed' then payout.amount else 0 end;
    deductions_status:='fixed';employer_status:='fixed';
  else known:=private.finance_payroll_known_cost(terms.basis,wage,case when terms.basis='net' then wage else wage-deductions_value end,deductions_value,employer_value);
  end if;
  select coalesce(sum(r.amount),0) into consumed from public.finance_recognition_entries r where r.studio_id=p_studio and r.obligation_id=p_obligation;
  -- Preserve existing fixed-pay source snapshots until a monthly correction exists.
  snapshot:=jsonb_build_object('obligation',to_jsonb(obligation),'terms',to_jsonb(terms)-'pay_method'-'rate_per_m2','payout',to_jsonb(payout),
    'deductionsRevision',to_jsonb(deductions),'employerRevision',to_jsonb(employer),'deductionsStatus',deductions_status,'employerStatus',employer_status,
    'knownCost',known::text,'currency',code);
  if earning.id is not null or terms.pay_method='per_m2' then
    snapshot:=snapshot||jsonb_build_object('terms',to_jsonb(terms),'earningRevision',to_jsonb(earning),'payMethod',terms.pay_method,'liveBasis',period_basis);
  end if;
  ready:=case when earning.id is not null then true when terms.pay_method='per_m2' then false
    else coalesce(payout.commitment='agreed' and payout.certainty='fixed' or obligation.kind='payroll' and terms.amount=0,false) end;
  result:=jsonb_build_object('obligationId',obligation.id,'employeeId',obligation.employee_id,'label',obligation.employee_name,
    'kind',obligation.kind,'periodStart',obligation.period_start,'periodEnd',obligation.period_end,'currency',code,
    'knownCost',known::text,'recognizedCost',consumed::text,'remainingCost',(known-consumed)::text,
    'deductionsStatus',deductions_status,'employerStatus',employer_status,'basis',coalesce(terms.basis,'bonus'),
    'version',md5(snapshot::text),'snapshot',snapshot,
    'sourceReady',ready,
    'canConfirm',obligation.period_end<=(now() at time zone 'Europe/Kyiv')::date
      and ready);
  return result;
end $function$;

create or replace view public.finance_expected_balances with(security_invoker=true) as
 SELECT i.id,
    i.studio_id,
    i.direction,
    i.amount,
    i.currency,
    i.category_id,
    i.description,
    i.due_date,
    i.expected_payment_date,
    i.commitment,
    i.certainty,
    i.is_established,
    i.version,
    i.created_by,
    i.created_at,
    i.updated_at,
    COALESCE(a.settled, 0::numeric) AS settled_amount,
    greatest(0,i.amount - COALESCE(a.settled, 0::numeric) - COALESCE(j.adjusted, 0::numeric)) AS remaining_amount,
        CASE
            WHEN (COALESCE(a.settled, 0::numeric) + COALESCE(j.adjusted, 0::numeric)) >= i.amount THEN 'settled'::text
            WHEN (COALESCE(a.settled, 0::numeric) + COALESCE(j.adjusted, 0::numeric)) = 0::numeric THEN 'unpaid'::text
            ELSE 'partial'::text
        END AS payment_state,
        CASE
            WHEN i.due_date IS NULL THEN 'unscheduled'::text
            WHEN i.due_date > (now() AT TIME ZONE 'Europe/Kyiv'::text)::date THEN 'not_due'::text
            WHEN i.due_date = (now() AT TIME ZONE 'Europe/Kyiv'::text)::date THEN 'due'::text
            ELSE 'overdue'::text
        END AS due_state,
        CASE
            WHEN i.is_established AND i.commitment = 'agreed'::text AND i.certainty = 'fixed'::text THEN greatest(0,i.amount - COALESCE(a.settled, 0::numeric) - COALESCE(j.adjusted, 0::numeric))
            ELSE 0::numeric
        END AS outstanding_amount,
    i.vat_rate,
    i.price_basis,
    i.net_amount,
    i.vat_amount,
    COALESCE(j.adjusted, 0::numeric) AS adjustment_amount, greatest(0,coalesce(a.settled,0)-i.amount) as overpaid_amount
   FROM finance_expected_items i
     LEFT JOIN ( SELECT finance_allocations.studio_id,
            finance_allocations.expected_item_id,
            sum(finance_allocations.amount) AS settled
           FROM finance_allocations
          GROUP BY finance_allocations.studio_id, finance_allocations.expected_item_id) a ON a.studio_id = i.studio_id AND a.expected_item_id = i.id
     LEFT JOIN ( SELECT finance_settlement_adjustments.studio_id,
            finance_settlement_adjustments.expected_item_id,
            sum(finance_settlement_adjustments.amount) AS adjusted
           FROM finance_settlement_adjustments
          GROUP BY finance_settlement_adjustments.studio_id, finance_settlement_adjustments.expected_item_id) j ON j.studio_id = i.studio_id AND j.expected_item_id = i.id;

CREATE OR REPLACE FUNCTION private.capture_finance_forecast_inputs(p_studio_id uuid, p_horizon text, p_scenario text, p_fx jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare setup public.finance_settings;today date:=(now() at time zone 'Europe/Kyiv')::date;first_day date:=date_trunc('month',today)::date;last_day date;digits integer;result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  if setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  if p_horizon is null or p_horizon not in ('3','6','year','12') or p_scenario is null or p_scenario not in ('confirmed','planned') then raise exception 'finance_input_invalid'; end if;
  last_day:=(first_day+interval '12 months'-interval '1 day')::date;
  if jsonb_typeof(p_fx) is distinct from 'array' or jsonb_array_length(p_fx)>200 then raise exception 'finance_fx_invalid'; end if;
  if exists(select 1 from jsonb_to_recordset(p_fx) as f(currency text,rate numeric,source text,"effectiveDate" date)
    where f.currency is null or not exists(select 1 from public.finance_currencies c where c.code=f.currency)
    or f.rate is null or not(f.rate>0 and f.rate<=1000000000) or f.rate<>round(f.rate,10)
    or f.source is null or f.source not in ('manual','nbu') or f."effectiveDate" is distinct from today
    or (f.source='nbu' and setup.base_currency<>'UAH') or f.currency=setup.base_currency)
    or exists(select 1 from jsonb_to_recordset(p_fx) as f(currency text) group by currency having count(*)>1) then raise exception 'finance_fx_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=setup.base_currency;
  with expected as (
    select i.id,i.category_id,c.name as category,c.nature,i.direction,i.description,i.currency,i.remaining_amount,
      i.commitment,i.certainty,i.due_date,i.expected_payment_date,i.version,
      pi.project_id,pi.stream,oi.component,o.kind as obligation_kind,o.id as obligation_id,o.schedule_id,o.period_start,o.period_end
    from public.finance_expected_balances i
    join public.finance_categories c on c.studio_id=i.studio_id and c.id=i.category_id
    left join public.finance_project_items pi on pi.studio_id=i.studio_id and pi.expected_item_id=i.id
    left join public.finance_obligation_items oi on oi.studio_id=i.studio_id and oi.expected_item_id=i.id
    left join public.finance_obligations o on o.studio_id=oi.studio_id and o.id=oi.obligation_id
    where i.studio_id=p_studio_id and i.remaining_amount>0 and i.commitment in ('agreed','tentative')

  ), actual as (
    select date_trunc('month',financial_date)::date as month,category_id,direction,nature,sum(amount) as amount,bool_or(amount is null) as incomplete
    from public.finance_planning_actuals where studio_id=p_studio_id and financial_date between first_day and today group by 1,2,3,4

  ), budget as (
    select b.id,b.revision,make_date(b.year,n,1) as month,b.category_id,c.direction,c.nature,b.months[n] as amount
    from public.finance_current_budget b join public.finance_categories c on c.studio_id=b.studio_id and c.id=b.category_id
    cross join generate_series(1,12) n where b.studio_id=p_studio_id and make_date(b.year,n,1) between first_day and last_day

  ), diagnostics as (
    select 'payroll' as source,o.employee_id::text as id,max(coalesce(o.employee_name,t.name)) as label,
      case c.component when 'employer_cost' then 'unknown_employer_cost' else 'unknown_deductions' end as reason,min(t.currency) as currency,null::text as amount,min(o.period_start) as date,
      min((select min(coalesce(i.expected_payment_date,i.due_date,today)) from public.finance_obligation_items oi join public.finance_expected_items i on i.studio_id=oi.studio_id and i.id=oi.expected_item_id where oi.studio_id=o.studio_id and oi.obligation_id=o.id and i.commitment<>'cancelled')) as required_through
    from public.finance_obligations o join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
    join public.finance_payroll_unknown_costs c on c.studio_id=o.studio_id and c.obligation_id=o.id and c.status='unknown'
    where o.studio_id=p_studio_id and o.kind='payroll'
      and exists(select 1 from public.finance_obligation_items oi join public.finance_expected_items i on i.studio_id=oi.studio_id and i.id=oi.expected_item_id
        where oi.studio_id=o.studio_id and oi.obligation_id=o.id and i.commitment<>'cancelled' and coalesce(i.expected_payment_date,i.due_date,today)<=last_day)
    group by o.employee_id,c.component
    union all
    -- Coverage diagnostics only: no schedule amount is expanded into cash reporting.
    select 'schedule',s.id::text,t.name,'ungenerated_period',t.currency,null::text,d::date,(d+make_interval(months=>t.payment_month_offset))::date
    from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    cross join generate_series((first_day-interval '1 month')::timestamp,last_day::timestamp,interval '1 month') d
    where s.studio_id=p_studio_id and t.pay_method<>'per_m2' and d::date>=t.effective_from and (t.valid_through is null or d::date<=t.valid_through)
      and (t.commitment='agreed' or p_scenario='planned')
      and ((extract(year from d)-extract(year from t.effective_from))::integer*12+(extract(month from d)-extract(month from t.effective_from))::integer)%t.interval_months=0
      and (d+make_interval(months=>t.payment_month_offset))::date<=last_day
      and not exists(select 1 from public.finance_obligations o where o.studio_id=s.studio_id and o.schedule_id=s.id and o.period_start=d::date)
    union all
    select 'schedule',s.id::text,t.name,'piecework_unforecast',t.currency,null::text,d::date,(d+make_interval(months=>t.payment_month_offset))::date
    from public.finance_schedules s join public.finance_schedule_history t on t.studio_id=s.studio_id and t.schedule_id=s.id
    cross join generate_series(first_day::timestamp,last_day::timestamp,interval '1 month') d
    where s.studio_id=p_studio_id and t.pay_method='per_m2' and d::date>=t.effective_from and (t.valid_through is null or d::date<=t.valid_through)
      and (d+make_interval(months=>t.payment_month_offset))::date<=last_day
      and not exists(select 1 from public.finance_obligations o join public.finance_payroll_earning_revisions r on r.studio_id=o.studio_id and r.obligation_id=o.id
        where o.studio_id=s.studio_id and o.schedule_id=s.id and o.period_start=d::date)
    union all
    select 'project',p.project_id::text,pr.name,'unscheduled_project',p.currency,p.unscheduled_amount::text,null::date,null::date
    from public.finance_project_totals p join public.projects pr on pr.studio_id=p.studio_id and pr.id=p.project_id
    where p.studio_id=p_studio_id and p.unscheduled_amount>0
    union all
    select 'project',t.project_id::text,pr.name,'ungenerated_supervision',t.currency,null::text,d::date,d::date
    from public.finance_project_terms t join public.projects pr on pr.studio_id=t.studio_id and pr.id=t.project_id
    cross join generate_series(first_day::timestamp,last_day::timestamp,interval '1 month') d
    where t.studio_id=p_studio_id and t.mode='monthly' and d::date>=t.effective_from and (t.effective_through is null or d::date<=t.effective_through)
      and not exists(select 1 from public.finance_project_terms newer where newer.studio_id=t.studio_id and newer.project_id=t.project_id and newer.stream=t.stream and newer.revision>t.revision and newer.effective_from<=d::date)
      and not exists(select 1 from public.finance_project_items i where i.studio_id=t.studio_id and i.project_id=t.project_id and i.source='monthly' and i.period_start=d::date)

  ) select jsonb_build_object('version',2,'asOf',today,'from',first_day,'through',last_day,'cutover',setup.cutover_date,'currency',setup.base_currency,'digits',digits,'horizon',p_horizon,'scenario',p_scenario,
    'fx',p_fx||jsonb_build_array(jsonb_build_object('currency',setup.base_currency,'rate','1','source','identity','effectiveDate',today)),
    'expected',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('remaining_amount',e.remaining_amount::text) order by e.id) from expected e),'[]'),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'currency',b.currency,'amount',b.recorded_balance::text) order by b.id) from public.finance_account_balances b where b.studio_id=p_studio_id),'[]'),
    'actuals',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('amount',a.amount::text) order by a.month,a.category_id,a.direction,a.nature) from actual a),'[]'),
    'budgets',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('amount',b.amount::text) order by b.month,b.category_id) from budget b),'[]'),
    'diagnostics',coalesce((select jsonb_agg(to_jsonb(d) order by d.source,d.id,d.date) from diagnostics d),'[]'),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'direction',c.direction,'nature',c.nature,'archivedAt',c.archived_at,'default_key',c.default_key,'custom_name',c.custom_name) order by c.id) from public.finance_categories c where c.studio_id=p_studio_id),'[]'),
    'currencies',(select jsonb_agg(jsonb_build_object('code',c.code,'minorUnits',c.minor_units) order by c.code) from public.finance_currencies c)) into result;
  return result;
end $function$;

revoke all on function private.finance_payroll_period_basis(uuid,uuid),private.finance_payroll_payout_authorized(uuid,uuid,numeric),
  private.guard_finance_zero_payroll_payout() from public,anon,authenticated,service_role;

revoke all on function public.get_finance_payroll_period(uuid,uuid),public.confirm_finance_payroll_earning(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_payroll_period(uuid,uuid),public.confirm_finance_payroll_earning(uuid,uuid,jsonb) to authenticated;

create function private.guard_finance_piecework_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.amount>0 and exists(select 1 from public.finance_obligation_items l
    join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
    join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
    where l.studio_id=new.studio_id and l.expected_item_id=new.expected_item_id and l.component='payout' and t.pay_method='per_m2'
      and not exists(select 1 from public.finance_payroll_earning_revisions r where r.studio_id=o.studio_id and r.obligation_id=o.id))
    then raise exception 'finance_payroll_confirmation_required';end if;
  return new;
end $$;

create trigger finance_piecework_payment_guard before insert on public.finance_allocations
  for each row execute function private.guard_finance_piecework_payment();

-- Missing piecework occurrences have no fixed salary fallback. Reporting stays read-only.
CREATE OR REPLACE FUNCTION private.finance_labor_reporting_core(p_studio_id uuid, p_fx jsonb, p_open boolean, p_capacity jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      if t.id is not null and t.pay_method='fixed' then
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
    if p_capacity ? 'internalProjectId' then cfg.internal_project_id:=(p_capacity->>'internalProjectId')::uuid;end if;
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
    basis:=private.finance_labor_period_basis(p_studio_id,o,cfg,source,fx,base,p_capacity);
    issues:=basis->'issues';
    if candidate->>'terms_id' is null and candidate->>'kind'<>'bonus' then
      issues:=issues||jsonb_build_array(case when (candidate->>'candidates')::integer>1 then 'ambiguous_salary' else 'missing_salary' end);
    end if;
    if jsonb_array_length(basis->'missingDates')>0 then issues:=issues||jsonb_build_array('missing_reports');end if;
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
end $function$;

CREATE OR REPLACE FUNCTION private.finance_provisional_labor_values(p_basis jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; basis jsonb:=p_basis; budget numeric; digits integer; daily jsonb; allocated jsonb;
  closed boolean:=(p_basis->>'periodEnd')::date<(now() at time zone 'Europe/Kyiv')::date;
  remaining numeric; rate numeric; fx jsonb:=p_basis->'proposalFx';
begin
  select minor_units into digits from public.finance_currencies where code=p_basis->>'reportingCurrency';
  if p_basis->'source'->'snapshot'->>'payMethod'='per_m2' and not closed
    and coalesce((p_basis->'source'->>'sourceReady')::boolean,false)
    and not coalesce((p_basis->>'manual')::boolean,false) and jsonb_array_length(p_basis->'pools')=0
    and not (p_basis->'issues' ?| array['partial_employment','source_unavailable','payroll_source_review']) then
    -- This amount is already earned output, so do not prorate it by elapsed workdays again.
    if p_basis->'source'->>'currency'=p_basis->>'reportingCurrency' then rate:=1;
    elsif fx is not null and fx<>'null'::jsonb then rate:=(fx->>'rate')::numeric;end if;
    budget:=round((p_basis->'source'->>'remainingCost')::numeric*rate,digits);
    result:=private.finance_provisional_labor_values_before_months(p_basis);
    if budget is not null then
      budget:=budget-coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(result->'provisionalAllocations') a),0);
      return result||jsonb_build_object('provisionalRemainder',budget::text,
        'provisionalDailyRemainders',jsonb_build_array(jsonb_build_object('date',p_basis->>'asOf','amount',budget::text)));
    end if;
    return result||jsonb_build_object('provisionalDailyRemainders','[]'::jsonb);
  end if;
  if closed then
    -- Recognition already owns its cost/FX. Preview only the outstanding native delta.
    remaining:=(p_basis->'source'->>'remainingCost')::numeric;
    if p_basis->'source'->>'currency'=p_basis->>'reportingCurrency' then rate:=1;
    elsif fx is not null and fx<>'null'::jsonb then rate:=(fx->>'rate')::numeric;
    elsif (select count(distinct p->'fx'->>'rate') from jsonb_array_elements(p_basis->'pools') p where p->'fx'<>'null'::jsonb)=1 then
      select p->'fx' into fx from jsonb_array_elements(p_basis->'pools') p where p->'fx'<>'null'::jsonb limit 1;
      rate:=(fx->>'rate')::numeric;
    end if;
    budget:=case when remaining=0 then round(0,digits) else round(remaining*rate,digits) end;
    basis:=basis||jsonb_build_object('pools','[]'::jsonb,'proposedAllocations','[]'::jsonb,
      'proposedRemainder',budget::text,'proposalFx',fx);
  end if;
  result:=private.finance_provisional_labor_values_before_months(basis);
  -- A closed salary amount remains known without capacity evidence for project attribution.
  if closed and result->>'provisionalRemainder' is null and budget is not null
    and coalesce((basis->'source'->>'sourceReady')::boolean,false) and not (basis->>'manual')::boolean
    and not (basis->'issues' ?| array['partial_employment','source_unavailable','payroll_source_review']) then
    result:=result||jsonb_build_object('provisionalRemainder',budget::text);
  end if;
  if result->>'provisionalRemainder' is null then
    if closed and remaining>0 and rate is null and not (basis->'issues' ? 'fx_required') then
      result:=result||jsonb_build_object('issues',(basis->'issues')||jsonb_build_array('fx_required'));
    end if;
    return result||jsonb_build_object('provisionalDailyRemainders','[]'::jsonb);
  end if;
  budget:=(basis->>'proposedRemainder')::numeric+coalesce((select sum((i->>'amount')::numeric)
    from jsonb_array_elements(basis->'proposedAllocations') i),0);
  if closed then
    -- Closed payroll is dated like its eventual recognition; allocations still use actual Worklog shares.
    select coalesce(jsonb_agg(jsonb_build_object('projectId',project,'amount',amount::text) order by project),'[]') into allocated
      from (select a->>'projectId' as project,sum((a->>'amount')::numeric) as amount
        from jsonb_array_elements(result->'provisionalDailyAllocations') a group by a->>'projectId') parts;
    select coalesce(jsonb_agg(a||jsonb_build_object('date',p_basis->>'asOf') order by a->>'projectId'),'[]') into daily
      from jsonb_array_elements(allocated) a;
    budget:=budget-coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(allocated) a),0);
    return result||jsonb_build_object('provisionalAllocations',allocated,'provisionalDailyAllocations',daily,
      'provisionalRemainder',budget::text,'provisionalDailyRemainders',jsonb_build_array(jsonb_build_object('date',p_basis->>'asOf','amount',budget::text)));
  end if;
  with days as (
    select (d->>'date')::date as day,
      case when (d->>'submitted')::boolean or (d->>'date')::date<(now() at time zone 'Europe/Kyiv')::date
        then (d->>'scheduled')::numeric else (d->>'absence')::numeric end as capacity
    from jsonb_array_elements(basis->'days') d where (d->>'employed')::boolean
      and (d->>'date')::date between (basis->>'accruedFrom')::date and (basis->>'asOf')::date
  ), cumulative as (
    select day,coalesce(trunc(budget*sum(capacity) over(order by day)/nullif((basis->>'expectedMinutes')::numeric,0),digits),0) as amount from days
  ), increments as (
    select day,amount-coalesce(lag(amount) over(order by day),0) as amount from cumulative
  ) select coalesce(jsonb_agg(jsonb_build_object('date',day,'amount',(amount-coalesce((select sum((a->>'amount')::numeric)
    from jsonb_array_elements(result->'provisionalDailyAllocations') a where (a->>'date')::date=day),0))::text) order by day),'[]') into daily from increments;
  return result||jsonb_build_object('provisionalRemainder',round(coalesce((select sum((d->>'amount')::numeric) from jsonb_array_elements(daily) d),0),digits)::text,
    'provisionalDailyRemainders',daily);
end $function$;

revoke all on function private.guard_finance_piecework_payment() from public,anon,authenticated,service_role;

-- Deferred refreshes observe the complete task/stage transaction. They reuse the
-- same payroll reconciler without starting economic recognition or a new job system.
create function private.refresh_finance_piecework_period(p_studio uuid,p_employee uuid,p_month date) returns void
language plpgsql security definer set search_path='' as $$
declare schedule record;
begin
  if not exists(select 1 from public.finance_schedules s join public.finance_schedule_history t
    on t.studio_id=s.studio_id and t.schedule_id=s.id where s.studio_id=p_studio and s.employee_id=p_employee
      and t.pay_method='per_m2' and t.effective_from<=p_month and (t.valid_through is null or t.valid_through>=p_month)) then return;end if;
  perform 1 from public.studio_members where studio_id=p_studio and user_id=p_employee for share;
  perform 1 from public.finance_settings where studio_id=p_studio and finalized_at is not null for update;
  if not found then return;end if;
  for schedule in select distinct s.id,s.created_by from public.finance_schedules s join public.finance_schedule_history t
    on t.studio_id=s.studio_id and t.schedule_id=s.id where s.studio_id=p_studio and s.employee_id=p_employee
      and t.pay_method='per_m2' and t.effective_from<=p_month and (t.valid_through is null or t.valid_through>=p_month) order by s.id loop
    perform private.reconcile_finance_schedule_occurrences(p_studio,schedule.id,p_month,p_month,schedule.created_by);
  end loop;
end $$;
create function private.refresh_finance_piecework_attribution() returns trigger
language plpgsql security definer set search_path='' as $$
declare context record;
begin
  if tg_op='UPDATE' and row(new.studio_id,new.contributor_id,new.credited_area_m2,new.completed_at,new.voided_at)
    is not distinct from row(old.studio_id,old.contributor_id,old.credited_area_m2,old.completed_at,old.voided_at) then return null;end if;
  for context in select distinct v.studio,v.employee,date_trunc('month',v.completed at time zone 'Europe/Kyiv')::date as month
    from (values(new.studio_id,new.contributor_id,new.completed_at),(old.studio_id,old.contributor_id,old.completed_at)) v(studio,employee,completed)
    where v.studio is not null order by studio,employee,month loop
    perform private.refresh_finance_piecework_period(context.studio,context.employee,context.month);
  end loop;
  return null;
end $$;
create constraint trigger finance_piecework_attribution_refresh after insert or update or delete on public.productivity_attributions
  deferrable initially deferred for each row execute function private.refresh_finance_piecework_attribution();
create function private.refresh_finance_piecework_project() returns trigger
language plpgsql security definer set search_path='' as $$
declare context record;
begin
  if tg_op='UPDATE' and new.include_in_productivity is not distinct from old.include_in_productivity then return null;end if;
  for context in select distinct contributor_id,date_trunc('month',completed_at at time zone 'Europe/Kyiv')::date as month
    from public.productivity_attributions where studio_id=old.studio_id and project_id=old.id and voided_at is null order by contributor_id,month loop
    perform private.refresh_finance_piecework_period(old.studio_id,context.contributor_id,context.month);
  end loop;
  return null;
end $$;
create constraint trigger finance_piecework_project_refresh after update or delete on public.projects
  deferrable initially deferred for each row execute function private.refresh_finance_piecework_project();
revoke all on function private.refresh_finance_piecework_period(uuid,uuid,date),private.refresh_finance_piecework_attribution(),
  private.refresh_finance_piecework_project(),private.finance_payroll_period_basis(uuid,uuid) from public,anon,authenticated,service_role;

create index finance_payroll_productivity_employee_period_idx on public.productivity_attributions(studio_id,contributor_id,completed_at) where voided_at is null;
notify pgrst,'reload schema';
