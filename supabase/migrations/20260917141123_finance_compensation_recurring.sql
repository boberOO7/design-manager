-- Finance owns schedules; occurrences only feed the existing expected-item ledger.
create table public.finance_schedules (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  kind text not null check(kind in ('payroll','recurring')),
  employee_id uuid,
  stopped_from date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(studio_id,id),
  foreign key(studio_id,employee_id) references public.studio_members(studio_id,user_id) on delete restrict,
  check((kind='payroll')=(employee_id is not null)),
  check(stopped_from is null or extract(day from stopped_from)=1)
);
create unique index finance_active_payroll_employee on public.finance_schedules(studio_id,employee_id) where kind='payroll' and stopped_from is null;
create index finance_schedules_employee_idx on public.finance_schedules(studio_id,employee_id);
create index finance_schedules_creator_idx on public.finance_schedules(created_by);

create table public.finance_schedule_terms (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  schedule_id uuid not null,
  revision integer not null check(revision>0),
  name text not null check(char_length(btrim(name)) between 1 and 120),
  amount numeric not null check(amount>0 and amount<=9999999999.9999),
  currency text not null references public.finance_currencies(code),
  category_id uuid not null,
  interval_months integer not null check(interval_months in (1,3,12)),
  payout_day integer not null check(payout_day between 1 and 31),
  payment_month_offset integer not null default 0 check(payment_month_offset in (0,1)),
  effective_from date not null check(extract(day from effective_from)=1),
  effective_through date check(effective_through=(date_trunc('month',effective_through)+interval '1 month - 1 day')::date),
  commitment text not null check(commitment in ('agreed','tentative')),
  certainty text not null check(certainty in ('fixed','estimated')),
  basis text check(basis in ('net','gross')),
  employee_payout numeric check(employee_payout>0 and employee_payout<=9999999999.9999),
  employee_deductions numeric check(employee_deductions>=0 and employee_deductions<=9999999999.9999),
  employer_cost numeric check(employer_cost>=0 and employer_cost<=9999999999.9999),
  employer_cost_status text not null default 'unknown' check(employer_cost_status in ('unknown','fixed','estimated')),
  reason text not null check(char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(studio_id,id,schedule_id), unique(studio_id,schedule_id,revision),
  foreign key(studio_id,schedule_id) references public.finance_schedules(studio_id,id) on delete restrict,
  foreign key(studio_id,category_id) references public.finance_categories(studio_id,id) on delete restrict,
  check(effective_through is null or effective_through>=effective_from),
  check((employer_cost_status='unknown')=(employer_cost is null)),
  check((basis is null and employee_payout is null and employee_deductions is null and employer_cost is null)
    or (basis is not null and employee_payout is not null and interval_months=1 and commitment='agreed' and certainty='fixed'
      and ((basis='net' and amount=employee_payout) or (basis='gross' and employee_deductions is not null and amount=employee_payout+employee_deductions))))
);
create index finance_terms_category_idx on public.finance_schedule_terms(studio_id,category_id);
create index finance_terms_creator_idx on public.finance_schedule_terms(created_by);
create index finance_terms_currency_idx on public.finance_schedule_terms(currency);

create table public.finance_obligations (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id),
  schedule_id uuid,
  terms_id uuid,
  kind text not null check(kind in ('payroll','recurring','bonus')),
  employee_id uuid,
  employee_name text,
  period_start date not null,
  period_end date not null check(period_end>=period_start),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(studio_id,id), unique(studio_id,schedule_id,period_start),
  foreign key(studio_id,terms_id,schedule_id) references public.finance_schedule_terms(studio_id,id,schedule_id) on delete restrict,
  foreign key(studio_id,employee_id) references public.studio_members(studio_id,user_id) on delete restrict,
  check((kind='bonus' and schedule_id is null and terms_id is null) or (kind<>'bonus' and schedule_id is not null and terms_id is not null)),
  check((kind in ('payroll','bonus'))=(employee_id is not null)),
  check(employee_id is null or employee_name is not null)
);
create unique index finance_payroll_period_once on public.finance_obligations(studio_id,employee_id,period_start) where kind='payroll';
create index finance_obligations_terms_idx on public.finance_obligations(studio_id,terms_id,schedule_id);
create index finance_obligations_employee_idx on public.finance_obligations(studio_id,employee_id);
create index finance_obligations_creator_idx on public.finance_obligations(created_by);

create table public.finance_obligation_items (
  studio_id uuid not null,
  obligation_id uuid not null,
  expected_item_id uuid not null,
  component text not null check(component in ('payout','deductions','employer_cost','recurring','bonus')),
  primary key(studio_id,expected_item_id), unique(studio_id,obligation_id,component),
  foreign key(studio_id,obligation_id) references public.finance_obligations(studio_id,id) on delete restrict,
  foreign key(studio_id,expected_item_id) references public.finance_expected_items(studio_id,id) on delete restrict
);

do $$declare name text; begin
  foreach name in array array['finance_schedules','finance_schedule_terms','finance_obligations','finance_obligation_items'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy finance_admin_read on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',name);
    if name<>'finance_schedules' then
      execute format('create trigger finance_history_immutable before update or delete on public.%I for each row execute function private.reject_finance_history_change()',name);
    end if;
  end loop;
end $$;

-- Valid-to is derived across immutable revisions; the original submitted end is retained.
create view public.finance_schedule_history with(security_invoker=true) as
select t.*,least(t.effective_through, s.stopped_from-1,
  lead(t.effective_from) over(partition by t.studio_id,t.schedule_id order by t.revision)-1) as valid_through
from public.finance_schedule_terms t join public.finance_schedules s on s.studio_id=t.studio_id and s.id=t.schedule_id;

-- Deliberately amount-free. Employees still have no access through underlying RLS.
create view public.finance_payroll_calendar with(security_invoker=true) as
select i.studio_id,i.id as expected_item_id,o.employee_id,o.employee_name,
  coalesce(i.expected_payment_date,i.due_date) as payment_date
from public.finance_expected_items i
join public.finance_obligation_items l on l.studio_id=i.studio_id and l.expected_item_id=i.id
join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
where l.component in ('payout','bonus') and i.commitment<>'cancelled';
revoke all on public.finance_schedule_history,public.finance_payroll_calendar from public,anon,authenticated,service_role;
grant select on public.finance_schedule_history,public.finance_payroll_calendar to authenticated;

create function private.guard_finance_schedule() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'finance_history_immutable'; end if;
  if row(new.id,new.studio_id,new.kind,new.employee_id,new.created_by,new.created_at)
    is distinct from row(old.id,old.studio_id,old.kind,old.employee_id,old.created_by,old.created_at)
    or (old.stopped_from is not null and (new.stopped_from is null or new.stopped_from>old.stopped_from)) then raise exception 'finance_history_immutable'; end if;
  return new;
end $$;
create trigger finance_schedule_guard before update or delete on public.finance_schedules for each row execute function private.guard_finance_schedule();

-- Membership-first locking matches Team removal. Restoring access never restarts old pay.
create function private.stop_removed_employee_payroll() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.is_active and not new.is_active then
    perform 1 from public.finance_settings where studio_id=new.studio_id for update;
    update public.finance_schedules set stopped_from=least(stopped_from,(date_trunc('month',now() at time zone 'Europe/Kyiv')+interval '1 month')::date)
      where studio_id=new.studio_id and employee_id=new.user_id;
  end if;
  return new;
end $$;
create trigger finance_stop_removed_employee after update of is_active on public.studio_members for each row execute function private.stop_removed_employee_payroll();

create function public.save_finance_schedule(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','schedule','input',p_input); result uuid;
  schedule public.finance_schedules; prior public.finance_schedule_terms; category public.finance_categories;
  employee uuid:=nullif(p_input->>'employeeId','')::uuid; starts date:=(p_input->>'effectiveFrom')::date;
  digits integer; value numeric;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  -- Acquire the same member lock as Team before the Finance parent lock.
  if employee is not null then
    perform 1 from public.studio_members where studio_id=p_studio_id and user_id=employee for share;
  end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_finalized_setup_required'; end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio_id and id=nullif(p_input->>'id','')::uuid;
  if schedule.id is null then
    if nullif(p_input->>'id','') is not null then raise exception 'finance_schedule_invalid'; end if;
    if employee is not null and (not exists(select 1 from public.studio_members m join public.profiles p on p.id=m.user_id where m.studio_id=p_studio_id and m.user_id=employee and m.is_active and p.is_active)
      or exists(select 1 from public.finance_schedules s where s.studio_id=p_studio_id and s.employee_id=employee and (s.stopped_from is null or starts<s.stopped_from))) then raise exception 'finance_employee_invalid'; end if;
    insert into public.finance_schedules(studio_id,kind,employee_id,created_by)
      values(p_studio_id,p_input->>'kind',employee,auth.uid()) returning * into schedule;
  elsif schedule.kind is distinct from p_input->>'kind' or schedule.employee_id is distinct from employee or schedule.stopped_from is not null then raise exception 'finance_schedule_invalid'; end if;
  select * into prior from public.finance_schedule_terms where studio_id=p_studio_id and schedule_id=schedule.id order by revision desc limit 1;
  if coalesce(prior.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'finance_version_conflict'; end if;
  if prior.id is not null and (starts<=prior.effective_from or starts<=(now() at time zone 'Europe/Kyiv')::date
    or exists(select 1 from public.finance_obligations where studio_id=p_studio_id and schedule_id=schedule.id and period_end>=starts)) then raise exception 'finance_schedule_effective_date'; end if;
  select * into category from public.finance_categories where studio_id=p_studio_id and id=(p_input->>'categoryId')::uuid and archived_at is null;
  if category.id is null or category.direction<>'outgoing' or (schedule.kind='payroll' and category.default_key is distinct from 'salary') then raise exception 'finance_category_invalid'; end if;
  if (schedule.kind='payroll') is distinct from (nullif(p_input->>'basis','') is not null) then raise exception 'finance_compensation_invalid'; end if;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if digits is null then raise exception 'finance_amount_invalid'; end if;
  foreach value in array array[(p_input->>'amount')::numeric,nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,nullif(p_input->>'employerCost','')::numeric] loop
    if value is not null and (value<>round(value,digits) or value<0 or value>9999999999.9999) then raise exception 'finance_amount_invalid'; end if;
  end loop;
  insert into public.finance_schedule_terms(studio_id,schedule_id,revision,name,amount,currency,category_id,interval_months,payout_day,payment_month_offset,effective_from,effective_through,commitment,certainty,basis,employee_payout,employee_deductions,employer_cost,employer_cost_status,reason,created_by)
  values(p_studio_id,schedule.id,coalesce(prior.revision,0)+1,btrim(p_input->>'name'),(p_input->>'amount')::numeric,p_input->>'currency',category.id,
    (p_input->>'intervalMonths')::integer,(p_input->>'payoutDay')::integer,coalesce((p_input->>'paymentMonthOffset')::integer,0),starts,nullif(p_input->>'effectiveThrough','')::date,
    p_input->>'commitment',p_input->>'certainty',nullif(p_input->>'basis',''),nullif(p_input->>'employeePayout','')::numeric,nullif(p_input->>'employeeDeductions','')::numeric,
    nullif(p_input->>'employerCost','')::numeric,coalesce(p_input->>'employerCostStatus','unknown'),btrim(p_input->>'reason'),auth.uid());
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,schedule.id,auth.uid(),now());
  return schedule.id;
end $$;

create function public.stop_finance_schedule(p_studio_id uuid,p_request_id uuid,p_schedule_id uuid,p_from date) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','stop_schedule','id',p_schedule_id,'from',p_from); result uuid;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if p_from is null or extract(day from p_from)<>1 or p_from<=(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_schedule_effective_date'; end if;
  update public.finance_schedules set stopped_from=least(stopped_from,p_from) where studio_id=p_studio_id and id=p_schedule_id returning id into result;
  if result is null then raise exception 'finance_schedule_invalid'; end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

create function private.add_finance_obligation_item(p_studio uuid,p_obligation uuid,p_component text,p_amount numeric,p_currency text,p_category uuid,p_description text,p_due date,p_commitment text,p_certainty text) returns uuid
language plpgsql security definer set search_path='' as $$
declare item uuid;
begin
  item:=public.save_finance_expected_item(p_studio,gen_random_uuid(),jsonb_build_object('direction','outgoing','amount',p_amount,'currency',p_currency,'categoryId',p_category,
    'description',p_description,'dueDate',p_due,'expectedDate',p_due,'commitment',p_commitment,'certainty',p_certainty,'established',false));
  insert into public.finance_obligation_items values(p_studio,p_obligation,item,p_component);
  return item;
end $$;

create function public.generate_finance_obligations(p_studio_id uuid,p_request_id uuid,p_schedule_id uuid,p_from date,p_through date) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','generate_obligations','id',p_schedule_id,'from',p_from,'through',p_through); result uuid;
  schedule public.finance_schedules; terms public.finance_schedule_history; period date; period_end date; due_month date; due date;
  obligation uuid; employee_name text; cost_category uuid; months integer;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio_id and id=p_schedule_id;
  if schedule.employee_id is not null then
    perform 1 from public.studio_members where studio_id=p_studio_id and user_id=schedule.employee_id for share;
  end if;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio_id and id=p_schedule_id;
  if schedule.id is null then raise exception 'finance_schedule_invalid'; end if;
  if p_from is null or p_through is null or extract(day from p_from)<>1 or extract(day from p_through)<>1 or p_through<p_from or p_through>=p_from+interval '12 months' then raise exception 'finance_schedule_range'; end if;
  select full_name into employee_name from public.profiles where id=schedule.employee_id;
  select id into cost_category from public.finance_categories where studio_id=p_studio_id and default_key='employer_costs' and archived_at is null;
  for period in select generate_series(p_from::timestamp,p_through::timestamp,interval '1 month')::date loop
    -- Existing identities, including cancelled obligations, are never regenerated.
    if exists(select 1 from public.finance_obligations where studio_id=p_studio_id and schedule_id=schedule.id and period_start=period) then continue; end if;
    select * into terms from public.finance_schedule_history where studio_id=p_studio_id and schedule_id=schedule.id and effective_from<=period order by revision desc limit 1;
    if terms.id is null or period>terms.valid_through then continue; end if;
    months:=(extract(year from period)-extract(year from terms.effective_from))::integer*12+(extract(month from period)-extract(month from terms.effective_from))::integer;
    if months % terms.interval_months<>0 then continue; end if;
    period_end:=least((period+make_interval(months=>terms.interval_months)-interval '1 day')::date,terms.valid_through);
    due_month:=(period+make_interval(months=>terms.payment_month_offset))::date;
    due:=least(due_month+terms.payout_day-1,(due_month+interval '1 month - 1 day')::date);
    insert into public.finance_obligations(studio_id,schedule_id,terms_id,kind,employee_id,employee_name,period_start,period_end,created_by)
      values(p_studio_id,schedule.id,terms.id,schedule.kind,schedule.employee_id,employee_name,period,period_end,auth.uid()) returning id into obligation;
    perform private.add_finance_obligation_item(p_studio_id,obligation,case when schedule.kind='payroll' then 'payout' else 'recurring' end,
      coalesce(terms.employee_payout,terms.amount),terms.currency,terms.category_id,terms.name||' · '||to_char(period,'YYYY-MM'),due,terms.commitment,terms.certainty);
    if terms.employee_deductions>0 then
      perform private.add_finance_obligation_item(p_studio_id,obligation,'deductions',terms.employee_deductions,terms.currency,cost_category,terms.name||' · deductions · '||to_char(period,'YYYY-MM'),due,'agreed','fixed');
    end if;
    if terms.employer_cost>0 then
      perform private.add_finance_obligation_item(p_studio_id,obligation,'employer_cost',terms.employer_cost,terms.currency,cost_category,terms.name||' · employer cost · '||to_char(period,'YYYY-MM'),due,'agreed',terms.employer_cost_status);
    end if;
  end loop;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,schedule.id,auth.uid(),now());
  return schedule.id;
end $$;

create function public.create_finance_employee_bonus(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','employee_bonus','input',p_input); result uuid; category uuid; employee_name text;
  employee uuid:=(p_input->>'employeeId')::uuid;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  perform 1 from public.studio_members where studio_id=p_studio_id and user_id=employee for share;
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  -- Former members can still receive explicitly supplied earned bonuses/final payouts.
  select p.full_name into employee_name from public.studio_members m join public.profiles p on p.id=m.user_id where m.studio_id=p_studio_id and m.user_id=employee;
  if employee_name is null then raise exception 'finance_employee_invalid'; end if;
  select id into category from public.finance_categories where studio_id=p_studio_id and default_key='employee_bonus' and archived_at is null;
  insert into public.finance_obligations(studio_id,kind,employee_id,employee_name,period_start,period_end,created_by)
    values(p_studio_id,'bonus',employee,employee_name,(p_input->>'periodStart')::date,(p_input->>'periodEnd')::date,auth.uid()) returning id into result;
  perform private.add_finance_obligation_item(p_studio_id,result,'bonus',(p_input->>'amount')::numeric,p_input->>'currency',category,
    p_input->>'description',(p_input->>'dueDate')::date,'agreed','fixed');
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

-- Shared expected-item edits cannot change employee/service identity or configured pay.
-- Forecast timing, cancellation and explicit establishment retain the Phase 3 audit.
create function private.guard_finance_obligation_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare component text;
begin
  select l.component into component from public.finance_obligation_items l where l.studio_id=old.studio_id and l.expected_item_id=old.id;
  if component is null then return new; end if;
  if row(new.direction,new.currency,new.category_id,new.due_date) is distinct from row(old.direction,old.currency,old.category_id,old.due_date)
    or (component in ('payout','deductions','bonus') and row(new.amount,new.certainty) is distinct from row(old.amount,old.certainty)) then raise exception 'finance_obligation_locked'; end if;
  return new;
end $$;
create trigger finance_obligation_item_guard before update on public.finance_expected_items for each row execute function private.guard_finance_obligation_item();

revoke all on function private.guard_finance_schedule(),private.stop_removed_employee_payroll(),private.guard_finance_obligation_item(),
  private.add_finance_obligation_item(uuid,uuid,text,numeric,text,uuid,text,date,text,text) from public,anon,authenticated,service_role;
revoke all on function public.save_finance_schedule(uuid,uuid,jsonb),public.stop_finance_schedule(uuid,uuid,uuid,date),public.generate_finance_obligations(uuid,uuid,uuid,date,date),public.create_finance_employee_bonus(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_schedule(uuid,uuid,jsonb),public.stop_finance_schedule(uuid,uuid,uuid,date),public.generate_finance_obligations(uuid,uuid,uuid,date,date),public.create_finance_employee_bonus(uuid,uuid,jsonb) to authenticated;

-- Owner distributions use the same allocation flow, retaining non-operating nature.
create or replace view public.finance_payment_availability with(security_invoker=true) as
select m.id,m.studio_id,case when m.kind='owner_withdrawal' then 'outgoing' else m.kind end as direction,m.nature,m.category,m.category_id,m.description,m.financial_date,
  e.account_id,e.currency,abs(e.amount) as original_amount,
  case when r.id is not null then 0 else abs(e.amount)-coalesce(f.refunded,0) end as net_amount,
  coalesce(a.allocated,0) as allocated_amount,
  case when r.id is not null then 0 else abs(e.amount)-coalesce(f.refunded,0) end-coalesce(a.allocated,0) as unapplied_amount
from public.finance_movements m join public.finance_movement_entries e on e.studio_id=m.studio_id and e.movement_id=m.id and e.entry_role='primary'
left join public.finance_movements r on r.studio_id=m.studio_id and r.related_movement_id=m.id and r.kind='reversal'
left join (
  select f.studio_id,f.related_movement_id,sum(abs(e.amount)) as refunded from public.finance_movements f
  join public.finance_movement_entries e on e.studio_id=f.studio_id and e.movement_id=f.id and e.entry_role='primary'
  where f.kind='refund' and not exists(select 1 from public.finance_movements r where r.studio_id=f.studio_id and r.related_movement_id=f.id and r.kind='reversal')
  group by f.studio_id,f.related_movement_id
) f on f.studio_id=m.studio_id and f.related_movement_id=m.id
left join (select studio_id,movement_id,sum(amount) as allocated from public.finance_allocations group by studio_id,movement_id) a on a.studio_id=m.studio_id and a.movement_id=m.id
where m.kind in ('incoming','outgoing','owner_withdrawal');

create or replace function public.save_finance_expected_item(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','expected','input',p_input); result uuid;
  old public.finance_expected_items; category public.finance_categories; amount numeric; paid numeric; digits integer;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_finalized_setup_required'; end if;
  result:=coalesce(nullif(p_input->>'id','')::uuid,gen_random_uuid());
  select * into old from public.finance_expected_items where studio_id=p_studio_id and id=result;
  if old.id is null and nullif(p_input->>'id','') is not null then raise exception 'finance_expected_invalid'; end if;
  if old.id is not null and old.version is distinct from (p_input->>'version')::integer then raise exception 'finance_version_conflict'; end if;
  select * into category from public.finance_categories where studio_id=p_studio_id and id=(p_input->>'categoryId')::uuid;
  if not found or category.direction is distinct from p_input->>'direction'
    or (category.archived_at is not null and category.id is distinct from old.category_id) then raise exception 'finance_category_invalid'; end if;
  amount:=(p_input->>'amount')::numeric;
  select minor_units into digits from public.finance_currencies where code=p_input->>'currency';
  if amount is null or digits is null or not(amount>0 and amount<=9999999999.9999) or amount<>round(amount,digits) then raise exception 'finance_amount_invalid'; end if;
  select coalesce(sum(a.amount),0) into paid from public.finance_allocations a where studio_id=p_studio_id and expected_item_id=result;
  if amount<paid then raise exception 'finance_below_settled'; end if;
  if old.id is not null and exists(select 1 from public.finance_allocations where studio_id=p_studio_id and expected_item_id=result)
    and (old.currency is distinct from p_input->>'currency' or old.direction is distinct from p_input->>'direction'
      or category.nature is distinct from (select nature from public.finance_categories where studio_id=p_studio_id and id=old.category_id)) then raise exception 'finance_expected_identity_locked'; end if;
  insert into public.finance_expected_items(id,studio_id,direction,amount,currency,category_id,description,due_date,expected_payment_date,commitment,certainty,is_established,created_by)
  values(result,p_studio_id,p_input->>'direction',amount,p_input->>'currency',category.id,coalesce(p_input->>'description',''),
    nullif(p_input->>'dueDate','')::date,nullif(p_input->>'expectedDate','')::date,p_input->>'commitment',p_input->>'certainty',coalesce((p_input->>'established')::boolean,false),auth.uid())
  on conflict(id) do update set direction=excluded.direction,amount=excluded.amount,currency=excluded.currency,category_id=excluded.category_id,
    description=excluded.description,due_date=excluded.due_date,expected_payment_date=excluded.expected_payment_date,
    commitment=excluded.commitment,certainty=excluded.certainty,is_established=excluded.is_established,
    version=finance_expected_items.version+1,updated_at=now();
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

