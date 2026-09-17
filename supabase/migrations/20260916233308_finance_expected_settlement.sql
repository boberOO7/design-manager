-- Planning and matching reference the immutable cash ledger; they never create cash.
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  name text not null check(char_length(btrim(name)) between 1 and 120),
  direction text not null check(direction in ('incoming','outgoing')),
  nature text not null check(nature in ('operating','financing','owner_distribution')),
  default_key text,
  custom_name boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique(studio_id,id), unique(studio_id,default_key),
  check(nature<>'owner_distribution' or direction='outgoing')
);
create unique index finance_category_name_key on public.finance_categories(studio_id,lower(btrim(name)),direction,nature);

create function private.seed_finance_categories(p_studio uuid) returns void
language sql security definer set search_path='' as $$
  insert into public.finance_categories(studio_id,name,direction,nature,default_key,custom_name)
  select p_studio,v.name,v.direction,v.nature,v.key,false from (values
    ('project_payments','Project payments','incoming','operating'),
    ('supervision','Supervision','incoming','operating'),
    ('contractor_bonus','Contractor bonus income','incoming','operating'),
    ('other_income','Other income','incoming','operating'),
    ('salary','Salary','outgoing','operating'),
    ('employee_bonus','Employee bonus','outgoing','operating'),
    ('employer_costs','Employer taxes and contributions','outgoing','operating'),
    ('rent','Rent','outgoing','operating'),('utilities','Utilities','outgoing','operating'),
    ('cleaning','Cleaning','outgoing','operating'),('software','Software and subscriptions','outgoing','operating'),
    ('smm','SMM','outgoing','operating'),('advertising','Advertising','outgoing','operating'),
    ('taxes','Taxes and fees','outgoing','operating'),('equipment','Equipment','outgoing','operating'),
    ('maintenance','Maintenance and repair','outgoing','operating'),('other_expense','Other expense','outgoing','operating'),
    ('financing_in','Financing received','incoming','financing'),('financing_out','Financing repaid','outgoing','financing'),
    ('owner_distribution','Owner distribution','outgoing','owner_distribution')
  ) v(key,name,direction,nature) on conflict(studio_id,default_key) do nothing;
$$;
revoke all on function private.seed_finance_categories(uuid) from public,anon,authenticated,service_role;
select private.seed_finance_categories(studio_id) from public.finance_settings;
create function private.seed_new_finance_categories() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.seed_finance_categories(new.studio_id); return new; end;
$$;
revoke all on function private.seed_new_finance_categories() from public,anon,authenticated,service_role;
create trigger finance_category_defaults after insert on public.finance_settings
for each row execute function private.seed_new_finance_categories();

-- Existing headers stay untouched, including their original free-text snapshot.
alter table public.finance_movements add column category_id uuid;
alter table public.finance_movements add foreign key(studio_id,category_id) references public.finance_categories(studio_id,id) on delete restrict;
create index finance_movements_category_idx on public.finance_movements(studio_id,category_id);
create function private.classify_finance_movement() returns trigger
language plpgsql security definer set search_path='' as $$
declare category public.finance_categories; original public.finance_movements;
begin
  if new.kind in ('refund','reversal') then
    select * into original from public.finance_movements where studio_id=new.studio_id and id=new.related_movement_id;
    new.category_id:=original.category_id; new.category:=original.category; new.nature:=original.nature;
  elsif new.kind<>'transfer' then
    select * into category from public.finance_categories where studio_id=new.studio_id
      and id=(new.request_payload->>'categoryId')::uuid and archived_at is null;
    if not found or category.direction<>(case when new.kind='incoming' then 'incoming' else 'outgoing' end)
      or (new.kind='owner_withdrawal')<>(category.nature='owner_distribution') then raise exception 'finance_category_invalid'; end if;
    new.category_id:=category.id; new.category:=category.name; new.nature:=category.nature;
  end if;
  return new;
end;
$$;
revoke all on function private.classify_finance_movement() from public,anon,authenticated,service_role;
create trigger finance_classification before insert on public.finance_movements
for each row execute function private.classify_finance_movement();

create table public.finance_expected_items (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  direction text not null check(direction in ('incoming','outgoing')),
  amount numeric not null check(amount>0 and amount<=9999999999.9999),
  currency text not null references public.finance_currencies(code),
  category_id uuid not null,
  description text not null default '' check(char_length(description)<=2000),
  due_date date,
  expected_payment_date date,
  commitment text not null check(commitment in ('tentative','agreed','cancelled')),
  certainty text not null check(certainty in ('fixed','estimated')),
  is_established boolean not null default false,
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(studio_id,id),
  foreign key(studio_id,category_id) references public.finance_categories(studio_id,id) on delete restrict,
  check(not is_established or (commitment='agreed' and certainty='fixed'))
);
create index finance_expected_category_idx on public.finance_expected_items(studio_id,category_id);
create index finance_expected_dates_idx on public.finance_expected_items(studio_id,due_date,id);
create index finance_expected_creator_idx on public.finance_expected_items(created_by);

-- Signed matching history. Negative rows release a specific earlier allocation.
create table public.finance_allocations (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  expected_item_id uuid not null,
  movement_id uuid not null,
  amount numeric not null check(amount<>0 and amount between -9999999999.9999 and 9999999999.9999),
  released_allocation_id uuid,
  cause_movement_id uuid,
  reason text not null default '' check(char_length(reason)<=2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(studio_id,id,expected_item_id,movement_id),
  foreign key(studio_id,expected_item_id) references public.finance_expected_items(studio_id,id) on delete restrict,
  foreign key(studio_id,movement_id) references public.finance_movements(studio_id,id) on delete restrict,
  foreign key(studio_id,cause_movement_id) references public.finance_movements(studio_id,id) on delete restrict,
  foreign key(studio_id,released_allocation_id,expected_item_id,movement_id)
    references public.finance_allocations(studio_id,id,expected_item_id,movement_id) on delete restrict,
  check((amount<0)=(released_allocation_id is not null)),
  check(amount>0 or char_length(btrim(reason))>0)
);
create index finance_allocations_item_idx on public.finance_allocations(studio_id,expected_item_id);
create index finance_allocations_movement_idx on public.finance_allocations(studio_id,movement_id);
create index finance_allocations_release_idx on public.finance_allocations(studio_id,released_allocation_id);
create index finance_allocations_cause_idx on public.finance_allocations(studio_id,cause_movement_id);
create index finance_allocations_creator_idx on public.finance_allocations(created_by);
create trigger finance_allocations_immutable before update or delete on public.finance_allocations
for each row execute function private.reject_finance_history_change();

-- Also retains submitted expected-item revisions without overwriting their dates.
create table public.finance_planning_requests (
  studio_id uuid not null references public.finance_settings(studio_id),
  request_id uuid not null,
  payload jsonb not null,
  result_id uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(studio_id,request_id)
);
create index finance_planning_creator_idx on public.finance_planning_requests(created_by);
create trigger finance_planning_immutable before update or delete on public.finance_planning_requests
for each row execute function private.reject_finance_history_change();
alter table public.finance_categories enable row level security;
alter table public.finance_expected_items enable row level security;
alter table public.finance_allocations enable row level security;
alter table public.finance_planning_requests enable row level security;
revoke all on public.finance_categories,public.finance_expected_items,public.finance_allocations,public.finance_planning_requests from public,anon,authenticated,service_role;
grant select on public.finance_categories,public.finance_expected_items,public.finance_allocations,public.finance_planning_requests to authenticated;
create policy finance_categories_admin on public.finance_categories for select to authenticated using((select private.is_finance_admin(studio_id)));
create policy finance_expected_admin on public.finance_expected_items for select to authenticated using((select private.is_finance_admin(studio_id)));
create policy finance_allocations_admin on public.finance_allocations for select to authenticated using((select private.is_finance_admin(studio_id)));
create policy finance_planning_admin on public.finance_planning_requests for select to authenticated using((select private.is_finance_admin(studio_id)));

create function private.begin_finance_planning(p_studio uuid,p_request uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior public.finance_planning_requests;
begin
  if not private.is_finance_admin(p_studio) then raise exception 'finance_admin_required'; end if;
  -- Same parent-first lock as cash posting: allocation/refund races serialize here.
  perform 1 from public.finance_settings where studio_id=p_studio for update;
  if not found or p_request is null then raise exception 'finance_input_invalid'; end if;
  select * into prior from public.finance_planning_requests where studio_id=p_studio and request_id=p_request;
  if found then
    if prior.payload is distinct from p_payload then raise exception 'finance_request_conflict'; end if;
    return prior.result_id;
  end if;
  return null;
end;
$$;
revoke all on function private.begin_finance_planning(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.save_finance_category(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','category','input',p_input); result uuid; old public.finance_categories;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  result:=coalesce(nullif(p_input->>'id','')::uuid,gen_random_uuid());
  select * into old from public.finance_categories where studio_id=p_studio_id and id=result;
  if found then
    if old.direction is distinct from p_input->>'direction' or old.nature is distinct from p_input->>'nature' then raise exception 'finance_category_semantics_immutable'; end if;
    update public.finance_categories set name=btrim(p_input->>'name'),
      custom_name=old.custom_name or old.name is distinct from btrim(p_input->>'name'),
      archived_at=case when (p_input->>'archived')::boolean then coalesce(old.archived_at,now()) else null end
      where studio_id=p_studio_id and id=result;
  else
    if nullif(p_input->>'id','') is not null then raise exception 'finance_category_invalid'; end if;
    insert into public.finance_categories(id,studio_id,name,direction,nature)
    values(result,p_studio_id,btrim(p_input->>'name'),p_input->>'direction',p_input->>'nature');
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

create view public.finance_expected_balances with(security_invoker=true) as
select i.*,coalesce(a.settled,0) as settled_amount,i.amount-coalesce(a.settled,0) as remaining_amount,
  case when coalesce(a.settled,0)=0 then 'unpaid' when a.settled=i.amount then 'settled' else 'partial' end as payment_state,
  case when i.due_date is null then 'unscheduled' when i.due_date>(now() at time zone 'Europe/Kyiv')::date then 'not_due'
    when i.due_date=(now() at time zone 'Europe/Kyiv')::date then 'due' else 'overdue' end as due_state,
  case when i.is_established and i.commitment='agreed' and i.certainty='fixed' then i.amount-coalesce(a.settled,0) else 0 end as outstanding_amount
from public.finance_expected_items i left join (
  select studio_id,expected_item_id,sum(amount) as settled from public.finance_allocations group by studio_id,expected_item_id
) a on a.studio_id=i.studio_id and a.expected_item_id=i.id;

-- Only original incoming/outgoing principal can satisfy an expectation.
create view public.finance_payment_availability with(security_invoker=true) as
select m.id,m.studio_id,m.kind as direction,m.nature,m.category,m.category_id,m.description,m.financial_date,
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
where m.kind in ('incoming','outgoing');
revoke all on public.finance_expected_balances,public.finance_payment_availability from public,anon,authenticated,service_role;
grant select on public.finance_expected_balances,public.finance_payment_availability to authenticated;

create function public.save_finance_expected_item(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
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
  if not found or category.direction is distinct from p_input->>'direction' or category.nature='owner_distribution'
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

create function public.allocate_finance_payment(p_studio_id uuid,p_request_id uuid,p_item_id uuid,p_movement_id uuid,p_amount numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','allocate','item',p_item_id,'movement',p_movement_id,'amount',p_amount);
  result uuid; item public.finance_expected_balances; payment public.finance_payment_availability; digits integer;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into item from public.finance_expected_balances where studio_id=p_studio_id and id=p_item_id;
  select * into payment from public.finance_payment_availability where studio_id=p_studio_id and id=p_movement_id;
  if item.id is null or payment.id is null or item.commitment='cancelled' or item.currency<>payment.currency or item.direction<>payment.direction then raise exception 'finance_allocation_incompatible'; end if;
  if payment.nature is distinct from (select nature from public.finance_categories where studio_id=p_studio_id and id=item.category_id) then raise exception 'finance_allocation_incompatible'; end if;
  select minor_units into digits from public.finance_currencies where code=item.currency;
  if p_amount is null or not(p_amount>0 and p_amount<=9999999999.9999) or p_amount<>round(p_amount,digits) then raise exception 'finance_amount_invalid'; end if;
  if p_amount>item.remaining_amount or p_amount>payment.unapplied_amount then raise exception 'finance_overallocation'; end if;
  insert into public.finance_allocations(studio_id,expected_item_id,movement_id,amount,created_by)
  values(p_studio_id,p_item_id,p_movement_id,p_amount,auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

-- Contextual "record payment" is the same ledger posting plus matching, atomically.
create function public.record_finance_expected_payment(p_studio_id uuid,p_request_id uuid,p_item_id uuid,p_input jsonb,p_allocation_amount numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare movement uuid;
begin
  movement:=public.record_finance_movement(p_studio_id,p_request_id,p_input);
  perform public.allocate_finance_payment(p_studio_id,p_request_id,p_item_id,movement,p_allocation_amount);
  return movement;
end;
$$;
revoke all on function public.record_finance_expected_payment(uuid,uuid,uuid,jsonb,numeric) from public,anon,authenticated,service_role;
grant execute on function public.record_finance_expected_payment(uuid,uuid,uuid,jsonb,numeric) to authenticated;

create function public.release_finance_allocation(p_studio_id uuid,p_request_id uuid,p_allocation_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','release','allocation',p_allocation_id,'reason',btrim(p_reason));
  result uuid; original public.finance_allocations; remaining numeric;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload); if result is not null then return result; end if;
  select * into original from public.finance_allocations where studio_id=p_studio_id and id=p_allocation_id and amount>0;
  if not found or p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'finance_allocation_invalid'; end if;
  select original.amount+coalesce(sum(amount),0) into remaining from public.finance_allocations where studio_id=p_studio_id and released_allocation_id=original.id;
  if remaining<=0 then raise exception 'finance_allocation_released'; end if;
  insert into public.finance_allocations(studio_id,expected_item_id,movement_id,amount,released_allocation_id,reason,created_by)
  values(p_studio_id,original.expected_item_id,original.movement_id,-remaining,original.id,btrim(p_reason),auth.uid()) returning id into result;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

-- Posting a refund/reversal releases only cash that is no longer available.
-- Unapplied cash absorbs refunds first, then newest allocations are released.
create function private.release_refunded_finance_allocations() returns trigger
language plpgsql security definer set search_path='' as $$
declare event public.finance_movements; payment public.finance_payment_availability;
  excess numeric; allocation record; released numeric;
begin
  if new.entry_role<>'primary' then return new; end if;
  select * into event from public.finance_movements where studio_id=new.studio_id and id=new.movement_id;
  if event.kind not in ('refund','reversal') then return new; end if;
  select * into payment from public.finance_payment_availability where studio_id=new.studio_id and id=event.related_movement_id;
  if not found then return new; end if; -- A reversed refund restores unapplied cash, never stale allocations.
  excess:=payment.allocated_amount-payment.net_amount;
  for allocation in
    select a.*,a.amount+coalesce((select sum(r.amount) from public.finance_allocations r where r.studio_id=a.studio_id and r.released_allocation_id=a.id),0) as remaining
    from public.finance_allocations a where a.studio_id=new.studio_id and a.movement_id=payment.id and a.amount>0 order by a.created_at desc,a.id desc
  loop
    exit when excess<=0;
    released:=least(excess,allocation.remaining);
    if released>0 then
      insert into public.finance_allocations(studio_id,expected_item_id,movement_id,amount,released_allocation_id,cause_movement_id,reason,created_by)
      values(new.studio_id,allocation.expected_item_id,payment.id,-released,allocation.id,event.id,'cash_'||event.kind,event.created_by);
      excess:=excess-released;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.release_refunded_finance_allocations() from public,anon,authenticated,service_role;
create trigger finance_refund_settlement after insert on public.finance_movement_entries
for each row execute function private.release_refunded_finance_allocations();

revoke all on function public.save_finance_category(uuid,uuid,jsonb),public.save_finance_expected_item(uuid,uuid,jsonb),
  public.allocate_finance_payment(uuid,uuid,uuid,uuid,numeric),public.release_finance_allocation(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_category(uuid,uuid,jsonb),public.save_finance_expected_item(uuid,uuid,jsonb),
  public.allocate_finance_payment(uuid,uuid,uuid,uuid,numeric),public.release_finance_allocation(uuid,uuid,uuid,text) to authenticated;
