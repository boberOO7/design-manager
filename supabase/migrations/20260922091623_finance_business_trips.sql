-- Operational travel costs. Actual cash and settlements stay in the Finance ledger.
create table public.finance_trips (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  title text not null check(char_length(btrim(title)) between 1 and 160),
  destination text not null check(char_length(btrim(destination)) between 1 and 160),
  starts_on date not null, ends_on date not null check(ends_on>=starts_on),
  project_id uuid, note text not null default '' check(char_length(note)<=2000),
  status text not null default 'planned' check(status in ('planned','active','completed','cancelled')),
  version integer not null default 1, created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(studio_id,id), foreign key(studio_id,project_id) references public.projects(studio_id,id) on delete restrict
);
create index finance_trips_project_idx on public.finance_trips(studio_id,project_id);
create index finance_trips_creator_idx on public.finance_trips(created_by);
create table public.finance_trip_travelers (
  studio_id uuid not null, trip_id uuid not null, employee_id uuid not null,
  employee_name text not null, active boolean not null default true,
  primary key(studio_id,trip_id,employee_id),
  foreign key(studio_id,trip_id) references public.finance_trips(studio_id,id) on delete restrict,
  foreign key(studio_id,employee_id) references public.studio_members(studio_id,user_id) on delete restrict
);
create index finance_trip_travelers_employee_idx on public.finance_trip_travelers(studio_id,employee_id);
create table public.finance_trip_entries (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null, trip_id uuid not null,
  kind text not null check(kind in ('plan','expense','advance')),
  expense_type text not null check(expense_type in ('travel','accommodation','meals','transport','visa','other')),
  label text not null default '' check(char_length(label)<=160),
  amount numeric not null check(amount<>0 and abs(amount)<=9999999999.9999),
  currency text not null references public.finance_currencies(code), financial_date date not null,
  employee_id uuid, movement_id uuid, expected_item_id uuid,
  plan_id uuid, reverses_id uuid, note text not null default '' check(char_length(note)<=2000),
  reporting_currency text not null, reporting_amount numeric not null,
  fx_rate numeric not null check(fx_rate>0 and fx_rate<=1000000000 and fx_rate=round(fx_rate,10)),
  fx_source text not null check(fx_source in ('identity','manual','nbu')), fx_effective_date date not null,
  daily_rate numeric, day_count integer,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id,trip_id), unique(studio_id,movement_id), unique(studio_id,reverses_id), unique(studio_id,plan_id),
  foreign key(studio_id,trip_id) references public.finance_trips(studio_id,id) on delete restrict,
  foreign key(studio_id,trip_id,employee_id) references public.finance_trip_travelers(studio_id,trip_id,employee_id) on delete restrict,
  foreign key(studio_id,movement_id) references public.finance_movements(studio_id,id) on delete restrict,
  foreign key(studio_id,expected_item_id) references public.finance_expected_items(studio_id,id) on delete restrict,
  foreign key(studio_id,plan_id,trip_id) references public.finance_trip_entries(studio_id,id,trip_id) on delete restrict,
  foreign key(studio_id,reverses_id,trip_id) references public.finance_trip_entries(studio_id,id,trip_id) on delete restrict,
  foreign key(studio_id,reporting_currency) references public.finance_settings(studio_id,base_currency) on delete restrict,
  check((amount<0)=(reverses_id is not null)),
  check((currency=reporting_currency and fx_source='identity' and fx_rate=1) or (currency<>reporting_currency and fx_source in ('manual','nbu'))),
  check(fx_source<>'nbu' or reporting_currency='UAH'),
  check(kind<>'advance' or (employee_id is not null and movement_id is not null)),
  check(kind<>'expense' or employee_id is not null or movement_id is not null),
  check(kind<>'plan' or (movement_id is null and employee_id is null)),
  check((daily_rate is null and day_count is null) or (daily_rate>0 and day_count between 1 and 366 and abs(amount)=daily_rate*day_count and expense_type='meals'))
);
create index finance_trip_entries_trip_idx on public.finance_trip_entries(studio_id,trip_id,financial_date,id);
create index finance_trip_entries_employee_idx on public.finance_trip_entries(studio_id,trip_id,employee_id);
create index finance_trip_entries_expected_idx on public.finance_trip_entries(studio_id,expected_item_id);
create index finance_trip_entries_creator_idx on public.finance_trip_entries(created_by);
create table public.finance_trip_balances (
  studio_id uuid not null, trip_id uuid not null, employee_id uuid not null,
  currency text not null references public.finance_currencies(code),
  direction text not null check(direction in ('incoming','outgoing')), expected_item_id uuid not null,
  primary key(studio_id,trip_id,employee_id,currency,direction), unique(studio_id,expected_item_id),
  foreign key(studio_id,trip_id,employee_id) references public.finance_trip_travelers(studio_id,trip_id,employee_id) on delete restrict,
  foreign key(studio_id,expected_item_id) references public.finance_expected_items(studio_id,id) on delete restrict
);

-- New travel category is created on first trip; existing catalogs are not expanded until used.
create function private.trip_category(p_studio uuid,p_direction text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if p_direction='incoming' then
    select id into result from public.finance_categories where studio_id=p_studio and default_key='other_income';
  else
    select id into result from public.finance_categories where studio_id=p_studio and default_key='business_travel';
    if result is null then
      insert into public.finance_categories(studio_id,name,direction,nature,default_key,custom_name)
      values(p_studio,'Business travel','outgoing','operating','business_travel',false) returning id into result;
    end if;
  end if;
  return result;
end $$;

-- One canonical historical valuation rule, also used by the ledger helper below.
create function private.finance_valuation(p_currency text,p_base text,p_date date,p_amount numeric,p_fx jsonb)
returns table(rate numeric,source text,effective_date date,reporting_amount numeric)
language plpgsql stable security definer set search_path='' as $$
declare digits integer;
begin
  select minor_units into digits from public.finance_currencies where code=p_base;
  if p_currency=p_base then rate:=1; source:='identity'; effective_date:=p_date;
  else rate:=(p_fx->>'rate')::numeric; source:=p_fx->>'source'; effective_date:=(p_fx->>'effectiveDate')::date;
  end if;
  if digits is null or rate is null or not(rate>0 and rate<=1000000000 and rate=round(rate,10))
    or source is null or (p_currency<>p_base and source not in ('manual','nbu'))
    or (source='nbu' and p_base<>'UAH') or effective_date is distinct from p_date then raise exception 'finance_fx_required'; end if;
  reporting_amount:=round(p_amount*rate,digits); return next;
end $$;
create or replace function private.add_finance_entry(p_studio uuid,p_movement uuid,p_account uuid,p_role text,p_amount numeric,p_fx jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare account public.finance_accounts; setup public.finance_settings; event public.finance_movements; digits integer; valuation record;
begin
  select * into account from public.finance_accounts where studio_id=p_studio and id=p_account and archived_at is null;
  if not found then raise exception 'finance_account_unavailable'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio;
  select * into event from public.finance_movements where studio_id=p_studio and id=p_movement;
  select minor_units into digits from public.finance_currencies where code=account.currency;
  if p_amount is null or p_amount=0 or p_amount<>round(p_amount,digits) then raise exception 'finance_amount_invalid'; end if;
  select * into valuation from private.finance_valuation(account.currency,setup.base_currency,event.financial_date,p_amount,p_fx);
  insert into public.finance_movement_entries(studio_id,movement_id,account_id,entry_role,currency,amount,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date)
  values(p_studio,p_movement,p_account,p_role,account.currency,p_amount,setup.base_currency,valuation.reporting_amount,valuation.rate,valuation.source,valuation.effective_date);
end $$;

-- Full original snapshots remain immutable. Net cash follows refunds and reversals.
create view public.finance_trip_entry_values with(security_invoker=true) as
select e.*,coalesce(c.amount,e.amount) as net_amount,coalesce(c.reporting_amount,e.reporting_amount) as net_reporting_amount
from public.finance_trip_entries e left join lateral (
  select -sum(v.amount) as amount,-sum(v.reporting_amount) as reporting_amount
  from public.finance_movements m join public.finance_movement_entries v on v.studio_id=m.studio_id and v.movement_id=m.id and v.entry_role='primary'
  where m.studio_id=e.studio_id and (m.id=e.movement_id or m.related_movement_id=e.movement_id
    or m.related_movement_id in(select id from public.finance_movements where studio_id=e.studio_id and related_movement_id=e.movement_id))
) c on e.movement_id is not null;

-- Reconciliation updates only derived expectations, never original receipts or cash.
create function private.reconcile_finance_trip(p_studio uuid,p_trip uuid) returns void
language plpgsql security definer set search_path='' as $$
declare person record; item public.finance_expected_items; link record; spent numeric; advanced numeric;
  paid_out numeric; paid_in numeric; balance numeric; target numeric; direction text; category uuid; result uuid;
  previous text:=current_setting('studioflow.trip_reconcile',true);
begin
  perform 1 from public.finance_settings where studio_id=p_studio for update;
  perform set_config('studioflow.trip_reconcile','on',true);
  -- Cash expectations consume their entire payment and never add a second future cost.
  for link in select e.expected_item_id,e.net_amount from public.finance_trip_entry_values e where e.studio_id=p_studio and e.trip_id=p_trip and e.movement_id is not null loop
    update public.finance_expected_items set amount=case when link.net_amount>0 then link.net_amount else amount end,
      commitment=case when link.net_amount>0 then 'agreed' else 'cancelled' end,is_established=link.net_amount>0,version=version+1,updated_at=now()
      where studio_id=p_studio and id=link.expected_item_id and (amount is distinct from link.net_amount or commitment is distinct from case when link.net_amount>0 then 'agreed' else 'cancelled' end);
  end loop;
  for person in select distinct employee_id,currency from public.finance_trip_entries where studio_id=p_studio and trip_id=p_trip and employee_id is not null loop
    select coalesce(sum(net_amount) filter(where kind='expense'),0),coalesce(sum(net_amount) filter(where kind='advance'),0)
      into spent,advanced from public.finance_trip_entry_values where studio_id=p_studio and trip_id=p_trip and employee_id=person.employee_id and currency=person.currency;
    select coalesce(sum(a.amount) filter(where b.direction='outgoing'),0),coalesce(sum(a.amount) filter(where b.direction='incoming'),0)
      into paid_out,paid_in from public.finance_trip_balances b left join public.finance_allocations a on a.studio_id=b.studio_id and a.expected_item_id=b.expected_item_id
      where b.studio_id=p_studio and b.trip_id=p_trip and b.employee_id=person.employee_id and b.currency=person.currency;
    balance:=spent-advanced-paid_out+paid_in;
    foreach direction in array array['outgoing','incoming'] loop
      target:=case when direction='outgoing' then paid_out+greatest(balance,0) else paid_in+greatest(-balance,0) end;
      select i.* into item from public.finance_trip_balances b join public.finance_expected_items i on i.studio_id=b.studio_id and i.id=b.expected_item_id
        where b.studio_id=p_studio and b.trip_id=p_trip and b.employee_id=person.employee_id and b.currency=person.currency and b.direction=direction;
      if item.id is null and target>0 then
        category:=private.trip_category(p_studio,direction);
        -- Internal derived expectations can retain an archived reporting category.
        insert into public.finance_expected_items(studio_id,direction,amount,currency,category_id,description,expected_payment_date,commitment,certainty,is_established,created_by)
        select p_studio,direction,target,person.currency,category,t.title||' · '||v.employee_name,(now() at time zone 'Europe/Kyiv')::date,'agreed','fixed',true,auth.uid()
          from public.finance_trips t join public.finance_trip_travelers v on v.studio_id=t.studio_id and v.trip_id=t.id and v.employee_id=person.employee_id
          where t.studio_id=p_studio and t.id=p_trip returning id into result;
        insert into public.finance_trip_balances values(p_studio,p_trip,person.employee_id,person.currency,direction,result);
      elsif item.id is not null then
        update public.finance_expected_items set amount=case when target>0 then target else amount end,
          commitment=case when target>0 then 'agreed' else 'cancelled' end,is_established=target>0,version=version+1,updated_at=now()
          where id=item.id and (amount is distinct from target or commitment is distinct from case when target>0 then 'agreed' else 'cancelled' end);
      end if;
    end loop;
  end loop;
  perform set_config('studioflow.trip_reconcile',coalesce(previous,''),true);
end $$;

create function public.save_finance_trip(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','trip','input',p_input); result uuid; old public.finance_trips; person uuid;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  if not exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null) then raise exception 'finance_finalized_setup_required'; end if;
  result:=coalesce(nullif(p_input->>'id','')::uuid,gen_random_uuid());
  select * into old from public.finance_trips where studio_id=p_studio_id and id=result;
  if nullif(p_input->>'id','') is not null and old.id is null then raise exception 'finance_trip_invalid'; end if;
  if old.id is not null and old.version is distinct from (p_input->>'version')::integer then raise exception 'finance_version_conflict'; end if;
  if jsonb_typeof(p_input->'travelers') is distinct from 'array' then raise exception 'finance_input_invalid'; end if;
  if old.id is not null and old.project_id is distinct from nullif(p_input->>'projectId','')::uuid
    and exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and trip_id=result) then raise exception 'finance_trip_project_locked'; end if;
  insert into public.finance_trips(id,studio_id,title,destination,starts_on,ends_on,project_id,note,status,created_by)
  values(result,p_studio_id,btrim(p_input->>'title'),btrim(p_input->>'destination'),(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,
    nullif(p_input->>'projectId','')::uuid,coalesce(p_input->>'note',''),p_input->>'status',auth.uid())
  on conflict(id) do update set title=excluded.title,destination=excluded.destination,starts_on=excluded.starts_on,ends_on=excluded.ends_on,
    project_id=excluded.project_id,note=excluded.note,status=excluded.status,version=finance_trips.version+1,updated_at=now();
  update public.finance_trip_travelers set active=false where studio_id=p_studio_id and trip_id=result;
  for person in select distinct value::uuid from jsonb_array_elements_text(p_input->'travelers') loop
    if not exists(select 1 from public.studio_members m join public.profiles p on p.id=m.user_id where m.studio_id=p_studio_id and m.user_id=person and m.is_active and p.is_active)
      and not exists(select 1 from public.finance_trip_travelers where studio_id=p_studio_id and trip_id=result and employee_id=person) then raise exception 'finance_trip_traveler_invalid'; end if;
    insert into public.finance_trip_travelers(studio_id,trip_id,employee_id,employee_name)
      select p_studio_id,result,person,full_name from public.profiles where id=person
      on conflict(studio_id,trip_id,employee_id) do update set active=true;
  end loop;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

create function public.record_finance_trip_entry(p_studio_id uuid,p_request_id uuid,p_trip_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','trip_entry','trip',p_trip_id,'input',p_input); result uuid;
  setup public.finance_settings; trip public.finance_trips; original public.finance_trip_entries; plan public.finance_trip_entries;
  payment public.finance_payment_availability; entry public.finance_movement_entries; valuation record;
  kind text:=p_input->>'kind'; day date:=(p_input->>'date')::date; amount numeric:=(p_input->>'amount')::numeric;
  currency text:=p_input->>'currency'; employee uuid:=nullif(p_input->>'employeeId','')::uuid; movement uuid; expected uuid; category uuid; digits integer; a record;
  previous text:=current_setting('studioflow.trip_reconcile',true);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id and finalized_at is not null;
  select * into trip from public.finance_trips where studio_id=p_studio_id and id=p_trip_id;
  if setup.studio_id is null or trip.id is null then raise exception 'finance_trip_invalid'; end if;
  result:=gen_random_uuid();
  if nullif(p_input->>'reversesId','') is not null then
    select * into original from public.finance_trip_entries where studio_id=p_studio_id and trip_id=p_trip_id and id=(p_input->>'reversesId')::uuid and reverses_id is null;
    if original.id is null or original.movement_id is not null or char_length(btrim(coalesce(p_input->>'note',''))) not between 1 and 2000
      or exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and plan_id=original.id) then raise exception 'finance_trip_correction_invalid'; end if;
    if original.expected_item_id is not null then
      if exists(select 1 from public.finance_allocations where studio_id=p_studio_id and expected_item_id=original.expected_item_id) then raise exception 'finance_trip_plan_settled'; end if;
      perform set_config('studioflow.trip_reconcile','on',true);
      update public.finance_expected_items set commitment='cancelled',is_established=false,version=version+1 where studio_id=p_studio_id and id=original.expected_item_id;
    end if;
    insert into public.finance_trip_entries(id,studio_id,trip_id,kind,expense_type,label,amount,currency,financial_date,employee_id,reverses_id,note,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,daily_rate,day_count,created_by)
    values(result,p_studio_id,p_trip_id,original.kind,original.expense_type,original.label,-original.amount,original.currency,original.financial_date,original.employee_id,original.id,btrim(p_input->>'note'),original.reporting_currency,-original.reporting_amount,original.fx_rate,original.fx_source,original.fx_effective_date,original.daily_rate,original.day_count,auth.uid());
  else
    if trip.status='cancelled' then raise exception 'finance_trip_closed'; end if;
    select minor_units into digits from public.finance_currencies where code=currency;
    if kind is null or kind not in ('plan','expense','advance') or day is null or (kind<>'plan' and (day<setup.cutover_date or day>(now() at time zone 'Europe/Kyiv')::date))
      or digits is null or amount is null or not(amount>0 and amount<=9999999999.9999) or amount<>round(amount,digits) then raise exception 'finance_amount_invalid'; end if;
    if employee is not null and not exists(select 1 from public.finance_trip_travelers where studio_id=p_studio_id and trip_id=p_trip_id and employee_id=employee and active) then raise exception 'finance_trip_traveler_invalid'; end if;
    if kind='advance' and employee is null then raise exception 'finance_trip_traveler_invalid'; end if;
    if kind='plan' and (employee is not null or nullif(p_input->>'movementId','') is not null or nullif(p_input->>'accountId','') is not null) then raise exception 'finance_input_invalid'; end if;
    if kind='expense' and employee is not null and (nullif(p_input->>'movementId','') is not null or nullif(p_input->>'accountId','') is not null) then raise exception 'finance_input_invalid'; end if;
    if nullif(p_input->>'planId','') is not null then
      select * into plan from public.finance_trip_entries where studio_id=p_studio_id and trip_id=p_trip_id and id=(p_input->>'planId')::uuid and kind='plan' and reverses_id is null;
      if kind<>'expense' or plan.id is null or exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and reverses_id=plan.id) then raise exception 'finance_trip_invalid'; end if;
      perform set_config('studioflow.trip_reconcile','on',true);
      -- A previously paid plan can be converted only with that exact, whole payment.
      for a in select x.*,x.amount+coalesce((select sum(r.amount) from public.finance_allocations r where r.released_allocation_id=x.id),0) as remaining from public.finance_allocations x
        where x.studio_id=p_studio_id and x.expected_item_id=plan.expected_item_id and x.amount>0 loop
        if a.remaining>0 then
          if a.movement_id is distinct from nullif(p_input->>'movementId','')::uuid then raise exception 'finance_trip_plan_settled'; end if;
          perform public.release_finance_allocation(p_studio_id,gen_random_uuid(),a.id,'Trip actual replaces planned cash');
        end if;
      end loop;
      update public.finance_expected_items set commitment='cancelled',is_established=false,version=version+1 where studio_id=p_studio_id and id=plan.expected_item_id;
    end if;
    category:=private.trip_category(p_studio_id,'outgoing');
    if kind='advance' or (kind='expense' and employee is null) then
      movement:=nullif(p_input->>'movementId','')::uuid;
      if movement is null then
        movement:=public.record_finance_movement(p_studio_id,p_request_id,jsonb_build_object('kind','outgoing','date',day,'accountId',p_input->>'accountId','amount',amount,'categoryId',category,'description',trip.title||' · '||coalesce(p_input->>'label',''),'allocationIntent',kind='advance','fx',p_input->'fx'));
      end if;
      select * into payment from public.finance_payment_availability where studio_id=p_studio_id and id=movement;
      select * into entry from public.finance_movement_entries where studio_id=p_studio_id and movement_id=movement and entry_role='primary';
      if payment.id is null or payment.direction<>'outgoing' or payment.nature<>'operating' or payment.currency<>currency
        or payment.original_amount<>amount or payment.unapplied_amount<>amount or payment.financial_date<>day
        or exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and movement_id=movement) then raise exception 'finance_trip_payment_invalid'; end if;
      expected:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_build_object('direction','outgoing','amount',amount,'currency',currency,'categoryId',category,'description',trip.title,'dueDate',day,'expectedDate',day,'commitment','agreed','certainty','fixed','established',true));
      perform public.allocate_finance_payment(p_studio_id,gen_random_uuid(),expected,movement,amount);
      select entry.fx_rate as rate,entry.fx_source as source,entry.fx_effective_date as effective_date,-entry.reporting_amount as reporting_amount into valuation;
    else
      select * into valuation from private.finance_valuation(currency,setup.base_currency,day,amount,p_input->'fx');
      if kind='plan' and nullif(p_input->>'expectedDate','') is not null then
        expected:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_build_object('direction','outgoing','amount',amount,'currency',currency,'categoryId',category,'description',trip.title||' · '||coalesce(p_input->>'label',''),'expectedDate',p_input->>'expectedDate','commitment','tentative','certainty','estimated','established',false));
      end if;
    end if;
    insert into public.finance_trip_entries(id,studio_id,trip_id,kind,expense_type,label,amount,currency,financial_date,employee_id,movement_id,expected_item_id,plan_id,note,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,daily_rate,day_count,created_by)
    values(result,p_studio_id,p_trip_id,kind,p_input->>'expenseType',coalesce(p_input->>'label',''),amount,currency,day,employee,movement,expected,plan.id,coalesce(p_input->>'note',''),setup.base_currency,valuation.reporting_amount,valuation.rate,valuation.source,valuation.effective_date,nullif(p_input->>'dailyRate','')::numeric,nullif(p_input->>'dayCount','')::integer,auth.uid());
  end if;
  perform private.reconcile_finance_trip(p_studio_id,p_trip_id);
  perform set_config('studioflow.trip_reconcile',coalesce(previous,''),true);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

create function private.guard_finance_trip_expected() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('studioflow.trip_reconcile',true)='on' then return new; end if;
  if exists(select 1 from public.finance_trip_entries where studio_id=old.studio_id and expected_item_id=old.id)
    or exists(select 1 from public.finance_trip_balances where studio_id=old.studio_id and expected_item_id=old.id) then
    if row(new.amount,new.currency,new.direction,new.category_id,new.commitment,new.certainty,new.is_established,new.description)
      is distinct from row(old.amount,old.currency,old.direction,old.category_id,old.commitment,old.certainty,old.is_established,old.description) then raise exception 'finance_trip_expected_locked'; end if;
  end if; return new;
end $$;
create trigger finance_trip_expected_guard before update on public.finance_expected_items for each row execute function private.guard_finance_trip_expected();
create function private.reconcile_finance_trip_settlement() returns trigger
language plpgsql security definer set search_path='' as $$
declare trip uuid;
begin
  if tg_table_name='finance_allocations' then
    if new.amount<0 and new.cause_movement_id is null and current_setting('studioflow.trip_reconcile',true) is distinct from 'on'
      and exists(select 1 from public.finance_trip_entries where studio_id=new.studio_id and expected_item_id=new.expected_item_id and movement_id is not null) then raise exception 'finance_trip_expected_locked'; end if;
    select trip_id into trip from public.finance_trip_balances where studio_id=new.studio_id and expected_item_id=new.expected_item_id;
    if trip is not null then perform private.reconcile_finance_trip(new.studio_id,trip); end if;
  else
    for trip in select distinct e.trip_id from public.finance_trip_entries e where e.studio_id=new.studio_id and e.movement_id in (
      select id from public.finance_movements where studio_id=new.studio_id and id=new.movement_id
      union select related_movement_id from public.finance_movements where studio_id=new.studio_id and id=new.movement_id
      union select parent.related_movement_id from public.finance_movements m join public.finance_movements parent on parent.studio_id=m.studio_id and parent.id=m.related_movement_id where m.studio_id=new.studio_id and m.id=new.movement_id
    ) loop perform private.reconcile_finance_trip(new.studio_id,trip); end loop;
  end if; return new;
end $$;
create trigger finance_trip_allocation after insert on public.finance_allocations for each row execute function private.reconcile_finance_trip_settlement();
-- Alphabetically after canonical refund allocation releases.
create trigger finance_z_trip_cash after insert on public.finance_movement_entries for each row execute function private.reconcile_finance_trip_settlement();

create view public.finance_trip_totals with(security_invoker=true) as
select t.*,s.base_currency as reporting_currency,coalesce(v.plan,0)::text as planned_amount,coalesce(v.actual,0)::text as actual_amount,
  (coalesce(v.actual,0)-coalesce(v.plan,0))::text as variance,coalesce(v.studio_paid,0)::text as studio_paid,coalesce(v.employee_paid,0)::text as employee_paid
from public.finance_trips t join public.finance_settings s on s.studio_id=t.studio_id left join lateral (
  select sum(net_reporting_amount) filter(where kind='plan') as plan,sum(net_reporting_amount) filter(where kind='expense') as actual,
    sum(net_reporting_amount) filter(where kind='expense' and employee_id is null) as studio_paid,
    sum(net_reporting_amount) filter(where kind='expense' and employee_id is not null) as employee_paid
  from public.finance_trip_entry_values where studio_id=t.studio_id and trip_id=t.id
) v on true;

-- SELECT-only RLS surfaces. All multi-row writes use guarded, serialized RPCs.
do $$ declare tab text; begin
  foreach tab in array array['finance_trips','finance_trip_travelers','finance_trip_entries','finance_trip_balances'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);
    execute format('grant select on public.%I to authenticated',tab);
    execute format('create policy trip_admin on public.%I for select to authenticated using((select private.is_finance_admin(studio_id)))',tab);
  end loop;
end $$;
create trigger finance_trip_entries_immutable before update or delete on public.finance_trip_entries for each row execute function private.reject_finance_history_change();
create trigger finance_trip_balances_immutable before update or delete on public.finance_trip_balances for each row execute function private.reject_finance_history_change();
revoke all on public.finance_trip_entry_values,public.finance_trip_totals from public,anon,authenticated,service_role;
grant select on public.finance_trip_entry_values,public.finance_trip_totals to authenticated;
revoke all on function private.trip_category(uuid,text),private.finance_valuation(text,text,date,numeric,jsonb),private.reconcile_finance_trip(uuid,uuid),private.guard_finance_trip_expected(),private.reconcile_finance_trip_settlement() from public,anon,authenticated,service_role;
revoke all on function public.save_finance_trip(uuid,uuid,jsonb),public.record_finance_trip_entry(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_trip(uuid,uuid,jsonb),public.record_finance_trip_entry(uuid,uuid,uuid,jsonb) to authenticated;
