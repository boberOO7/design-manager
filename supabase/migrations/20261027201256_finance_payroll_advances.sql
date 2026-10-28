-- Employee-owned UAH cash, including advances made in months without production.
-- USD credit is fixed at the advance payment date; subsequent FX changes affect only the unpaid salary.
-- Availability is derived from the existing ledger, refunds and allocations.
create table public.finance_payroll_cash (
  studio_id uuid not null references public.finance_settings(studio_id),
  movement_id uuid not null,
  employee_id uuid not null,
  obligation_id uuid,
  credit_currency text not null references public.finance_currencies(code) check(credit_currency in ('UAH','USD')),
  credit_amount numeric not null check(credit_amount>0 and credit_amount=round(credit_amount,2)),
  credit_rate numeric not null check(credit_rate>0 and credit_rate<=1000000000 and credit_rate=round(credit_rate,10)),
  credit_source text not null check(credit_source in ('identity','nbu','manual')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(studio_id,movement_id),
  foreign key(studio_id,movement_id) references public.finance_movements(studio_id,id),
  foreign key(studio_id,obligation_id) references public.finance_obligations(studio_id,id),
  foreign key(studio_id,employee_id) references public.studio_members(studio_id,user_id)
);
create index finance_payroll_cash_employee_idx on public.finance_payroll_cash(studio_id,employee_id);
create index finance_payroll_cash_obligation_idx on public.finance_payroll_cash(studio_id,obligation_id);
create index finance_payroll_cash_creator_idx on public.finance_payroll_cash(created_by);
alter table public.finance_payroll_cash enable row level security;
revoke all on public.finance_payroll_cash from public,anon,authenticated,service_role;
grant select on public.finance_payroll_cash to authenticated;
create policy finance_payroll_cash_admin on public.finance_payroll_cash for select to authenticated
using((select private.is_finance_admin(studio_id)));
create trigger finance_payroll_cash_immutable before update or delete on public.finance_payroll_cash
for each row execute function private.reject_finance_history_change();

-- Credit remains in the salary currency at the original payment-date rate.
create view public.finance_payroll_credit_availability with(security_invoker=true) as
select c.*,p.financial_date,p.unapplied_amount,
  greatest(round(c.credit_amount*p.net_amount/p.original_amount,2)-coalesce(a.allocated,0),0) as credit_available
from public.finance_payroll_cash c
join public.finance_payment_availability p on p.studio_id=c.studio_id and p.id=c.movement_id
left join (select studio_id,movement_id,obligation_currency,sum(amount) allocated from public.finance_allocations
  group by studio_id,movement_id,obligation_currency) a
  on a.studio_id=c.studio_id and a.movement_id=c.movement_id and a.obligation_currency=c.credit_currency;
revoke all on public.finance_payroll_credit_availability from public,anon,authenticated,service_role;
grant select on public.finance_payroll_credit_availability to authenticated;

create function public.get_finance_payroll_cash(p_studio_id uuid,p_schedule_id uuid,p_date date default (now() at time zone 'Europe/Kyiv')::date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare employee uuid;currency text;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select employee_id into employee from public.finance_schedules where studio_id=p_studio_id and id=p_schedule_id and kind='payroll';
  if employee is null then raise exception 'finance_input_invalid';end if;
  select t.currency into currency from public.finance_schedule_terms t where t.studio_id=p_studio_id and t.schedule_id=p_schedule_id
    and t.effective_from<=p_date order by t.effective_from desc,t.revision desc limit 1;
  return jsonb_build_object('currency',currency,'balances',coalesce((select jsonb_agg(jsonb_build_object('currency',b.credit_currency,'available',b.available::text))
    from (select c.credit_currency,sum(c.credit_available) available from public.finance_payroll_credit_availability c
      where c.studio_id=p_studio_id and c.employee_id=employee and c.obligation_id is null and c.financial_date<=p_date and c.credit_available>0 group by c.credit_currency)b),'[]'));
end $$;

create function private.finance_payroll_credit(p_amount numeric,p_currency text,p_date date,p_fx jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare rate numeric;
begin
  if p_currency='UAH' then return 1;end if;
  rate:=(p_fx->>'rate')::numeric;
  if p_currency is distinct from 'USD' or rate is null or rate<=0 or rate>1000000000 or rate<>round(rate,10)
    or coalesce(p_fx->>'source','') not in ('nbu','manual') or (p_fx->>'effectiveDate')::date is distinct from p_date
    or round(1/rate,10)<=0 or round(1/rate,10)>1000000000
    then raise exception 'finance_fx_required';end if;
  if round(p_amount/rate,2)<=0 then raise exception 'finance_amount_invalid';end if;
  return rate;
end $$;

create function public.record_finance_payroll_advance(p_studio_id uuid,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','payroll_advance','input',p_input);result uuid;
  schedule public.finance_schedules;category uuid; account public.finance_accounts; currency text;rate numeric;amount numeric:=(p_input->>'amount')::numeric;
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select * into schedule from public.finance_schedules where studio_id=p_studio_id and id=(p_input->>'scheduleId')::uuid and kind='payroll';
  select * into account from public.finance_accounts where studio_id=p_studio_id and id=(p_input->>'accountId')::uuid and archived_at is null;
  if schedule.id is null or account.id is null or account.currency<>'UAH'
    or not exists(select 1 from public.studio_members where studio_id=p_studio_id and user_id=schedule.employee_id and is_active)
    or nullif(btrim(p_input->>'note'),'') is null or char_length(p_input->>'note')>2000
  then raise exception 'finance_input_invalid';end if;
  select t.category_id,t.currency into category,currency from public.finance_schedule_terms t where t.studio_id=p_studio_id and t.schedule_id=schedule.id
    and t.effective_from<=(p_input->>'date')::date order by t.effective_from desc,t.revision desc limit 1;
  if currency is distinct from p_input->>'currency' then raise exception 'finance_version_conflict';end if;
  rate:=private.finance_payroll_credit(amount,currency,(p_input->>'date')::date,p_input->'payrollFx');
  result:=public.record_finance_movement(p_studio_id,p_request_id,jsonb_build_object('kind','outgoing','date',p_input->>'date',
    'accountId',account.id,'amount',p_input->>'amount','categoryId',category,'description',p_input->>'note','allocationIntent',true,'payrollFx',p_input->'payrollFx','payrollCreditCurrency',currency,'fx',p_input->'fx'));
  insert into public.finance_payroll_cash(studio_id,movement_id,employee_id,credit_currency,credit_amount,credit_rate,credit_source,created_by)
    values(p_studio_id,result,schedule.employee_id,currency,round(amount/rate,2),rate,case when currency='UAH' then 'identity' else p_input->'payrollFx'->>'source' end,auth.uid());
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

-- Null means that this expectation uses the ordinary settlement flow.
create function public.get_finance_payroll_payment(p_studio_id uuid,p_item_id uuid,p_date date,p_fx jsonb default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.finance_obligations;item public.finance_expected_balances;rate numeric; available numeric;total numeric;
  credits jsonb; revision integer; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  select ob.* into o from public.finance_obligation_items l join public.finance_obligations ob on ob.studio_id=l.studio_id and ob.id=l.obligation_id
    where l.studio_id=p_studio_id and l.expected_item_id=p_item_id and l.component='payout' and ob.kind='payroll';
  if o.id is null then return null;end if;
  select * into item from public.finance_expected_balances where studio_id=p_studio_id and id=p_item_id;
  if item.currency not in ('UAH','USD') then return null;end if;
  if item.commitment='cancelled' then raise exception 'finance_input_invalid';end if;
  if p_date is null or p_date>(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_input_invalid';end if;
  select coalesce(max(r.revision),0) into revision from public.finance_payroll_earning_revisions r where studio_id=p_studio_id and obligation_id=o.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.movement_id,'available',p.credit_available::text,'cash',p.unapplied_amount::text,'date',p.financial_date) order by p.financial_date,p.movement_id),'[]'),coalesce(sum(p.credit_available),0)
    into credits,available from public.finance_payroll_credit_availability p
    where p.studio_id=p_studio_id and p.employee_id=o.employee_id and p.credit_currency=item.currency and (p.obligation_id is null or p.obligation_id=o.id) and p.financial_date<=p_date and p.credit_available>0;
  if item.currency='UAH' then rate:=1;
  elsif p_fx is not null then
    rate:=(p_fx->>'rate')::numeric;
    if rate is null or rate<=0 or rate>1000000000 or rate<>round(rate,10) or coalesce(p_fx->>'source','') not in ('manual','nbu')
      or (p_fx->>'effectiveDate')::date is distinct from p_date or round(1/rate,10)<=0 or round(1/rate,10)>1000000000 then raise exception 'finance_fx_required';end if;
  end if;
  total:=round(item.remaining_amount*rate,2);
  result:=jsonb_build_object('obligationId',o.id,'employeeId',o.employee_id,'employeeName',o.employee_name,'currency',item.currency,
    'remaining',item.remaining_amount::text,'revision',revision,'version',item.version,'date',p_date,'rate',rate::text,'fx',p_fx,
    'advanceAvailable',available::text,'advanceUsed',least(available,item.remaining_amount)::text,'totalUah',total::text,
    'cashDue',round(greatest(item.remaining_amount-available,0)*rate,2)::text,'credits',credits);
  return result||jsonb_build_object('digest',md5(result::text));
end $$;

create function public.record_finance_payroll_payment(p_studio_id uuid,p_request_id uuid,p_item_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','payroll_payment','item',p_item_id,'input',p_input);result uuid;
  preview jsonb;account public.finance_accounts;payment record;movement uuid;employee uuid;category uuid;
  cash numeric:=(p_input->>'amount')::numeric; day date:=(p_input->>'date')::date;rate numeric;
  total numeric;remaining numeric;used numeric:=0;settled numeric:=0;part numeric;equivalent numeric;currency text;
  previous_settlement text:=current_setting('studioflow.finance_payroll_settlement',true);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  preview:=public.get_finance_payroll_payment(p_studio_id,p_item_id,day,p_input->'payrollFx');
  if preview is null or preview->>'digest' is distinct from p_input->>'digest' then raise exception 'finance_payroll_preview_stale';end if;
  if cash is null or cash<0 or cash>9999999999.99 or cash<>round(cash,2) then raise exception 'finance_amount_invalid';end if;
  total:=(preview->>'totalUah')::numeric; remaining:=(preview->>'remaining')::numeric;rate:=(preview->>'rate')::numeric;
  if total is null or rate is null or total<=0 or remaining<=0 then raise exception 'finance_fx_required';end if;
  employee:=(preview->>'employeeId')::uuid;currency:=preview->>'currency';
  if cash>(preview->>'cashDue')::numeric then raise exception 'finance_overallocation';end if;
  if cash=0 and (preview->>'advanceAvailable')::numeric<=0 then raise exception 'finance_amount_invalid';end if;
  if cash>0 then
    select * into account from public.finance_accounts where studio_id=p_studio_id and id=(p_input->>'accountId')::uuid and archived_at is null;
    if account.id is null or account.currency<>'UAH' then raise exception 'finance_payroll_uah_required';end if;
    select category_id into category from public.finance_expected_items where studio_id=p_studio_id and id=p_item_id and commitment<>'cancelled';
    if category is null then raise exception 'finance_input_invalid';end if;
    movement:=public.record_finance_movement(p_studio_id,p_request_id,jsonb_build_object('kind','outgoing','date',day,'accountId',account.id,
      'amount',cash,'categoryId',category,'description',p_input->>'note','allocationIntent',true,'payrollFx',p_input->'payrollFx','payrollCreditCurrency',currency,'fx',p_input->'fx'));
    rate:=private.finance_payroll_credit(cash,currency,day,p_input->'payrollFx');
    insert into public.finance_payroll_cash(studio_id,movement_id,employee_id,obligation_id,credit_currency,credit_amount,credit_rate,credit_source,created_by)
      values(p_studio_id,movement,employee,(preview->>'obligationId')::uuid,currency,round(cash/rate,2),rate,case when currency='UAH' then 'identity' else p_input->'payrollFx'->>'source' end,auth.uid());
  end if;
  perform set_config('studioflow.finance_payroll_settlement','on',true);
  -- Old advances first, using their frozen original currency amount and rate.
  for payment in select p.* from public.finance_payroll_credit_availability p
    where p.studio_id=p_studio_id and p.employee_id=employee and p.credit_currency=currency and (p.obligation_id is null or p.obligation_id=(preview->>'obligationId')::uuid) and p.financial_date<=day and p.credit_available>0 and p.unapplied_amount>0
    order by (p.movement_id=movement) nulls first,p.financial_date,p.movement_id
  loop
    exit when settled>=remaining;
    equivalent:=least(payment.credit_available,remaining-settled);
    part:=case when equivalent=payment.credit_available then payment.unapplied_amount
      else least(payment.unapplied_amount,round(payment.unapplied_amount*equivalent/payment.credit_available,2)) end;
    if part<=0 then raise exception 'finance_allocation_precision';end if;
    insert into public.finance_allocations(studio_id,expected_item_id,movement_id,amount,payment_amount,payment_currency,obligation_currency,
      settlement_rate,settlement_source,settlement_effective_date,created_by)
    values(p_studio_id,p_item_id,payment.movement_id,equivalent,part,'UAH',currency,case when currency='UAH' then 1 else round(1/payment.credit_rate,10) end,
      payment.credit_source,payment.financial_date,auth.uid());
    used:=used+part;settled:=settled+equivalent;
  end loop;
  perform set_config('studioflow.finance_payroll_settlement',coalesce(previous_settlement,''),true);
  if used=0 then raise exception 'finance_amount_invalid';end if;
  result:=coalesce(movement,p_item_id);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;

create function private.guard_finance_payroll_cash_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid;employee uuid;method text;currency text;
begin
  if new.amount<=0 then return new;end if;
  select employee_id into owner from public.finance_payroll_cash where studio_id=new.studio_id and movement_id=new.movement_id;
  select o.employee_id,t.pay_method,t.currency into employee,method,currency from public.finance_obligation_items l
    join public.finance_obligations o on o.studio_id=l.studio_id and o.id=l.obligation_id
    join public.finance_schedule_terms t on t.studio_id=o.studio_id and t.id=o.terms_id
    where l.studio_id=new.studio_id and l.expected_item_id=new.expected_item_id and l.component='payout' and o.kind='payroll';
  if owner is not null and (exists(select 1 from public.finance_payroll_cash c where c.studio_id=new.studio_id and c.movement_id=new.movement_id and c.obligation_id is not null and c.obligation_id is distinct from (select obligation_id from public.finance_obligation_items where studio_id=new.studio_id and expected_item_id=new.expected_item_id)) or owner is distinct from employee or new.obligation_currency is distinct from (select credit_currency from public.finance_payroll_cash where studio_id=new.studio_id and movement_id=new.movement_id) or coalesce(current_setting('studioflow.finance_payroll_settlement',true),'')<>'on')
    then raise exception 'finance_allocation_incompatible';end if;
  if method='per_m2' and currency='USD' and new.payment_currency<>'UAH' then raise exception 'finance_payroll_uah_required';end if;
  return new;
end $$;
create trigger finance_payroll_cash_allocation_guard before insert on public.finance_allocations
for each row execute function private.guard_finance_payroll_cash_allocation();

create function private.preserve_finance_payroll_cash_correction() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner uuid; original_category uuid;replacement public.finance_payment_availability;original public.finance_payroll_cash;rate numeric;fx jsonb;
begin
  select employee_id into owner from public.finance_payroll_cash where studio_id=new.studio_id and movement_id=new.original_movement_id;
  if owner is null then return new;end if;
  select category_id into original_category from public.finance_movements where studio_id=new.studio_id and id=new.original_movement_id;
  select * into replacement from public.finance_payment_availability where studio_id=new.studio_id and id=new.replacement_movement_id;
  if replacement.id is null or replacement.direction<>'outgoing' or replacement.currency<>'UAH' or replacement.category_id is distinct from original_category
    then raise exception 'finance_payroll_uah_required';end if;
  select * into original from public.finance_payroll_cash where studio_id=new.studio_id and movement_id=new.original_movement_id;
  if original.credit_currency='UAH' then rate:=1;
  else
    select request_payload->'payrollFx' into fx from public.finance_movements where studio_id=new.studio_id and id=new.replacement_movement_id;
    if fx is null and replacement.financial_date=(select financial_date from public.finance_movements where studio_id=new.studio_id and id=new.original_movement_id)
      then fx:=jsonb_build_object('rate',original.credit_rate,'source',original.credit_source,'effectiveDate',replacement.financial_date);end if;
    rate:=private.finance_payroll_credit(replacement.original_amount,original.credit_currency,replacement.financial_date,fx);
  end if;
  insert into public.finance_payroll_cash(studio_id,movement_id,employee_id,obligation_id,credit_currency,credit_amount,credit_rate,credit_source,created_by)
    values(new.studio_id,new.replacement_movement_id,owner,original.obligation_id,original.credit_currency,round(replacement.original_amount/rate,2),rate,
      case when original.credit_currency='UAH' then 'identity' else fx->>'source' end,auth.uid());
  return new;
end $$;
create trigger finance_payroll_cash_correction after insert on public.finance_movement_corrections
for each row execute function private.preserve_finance_payroll_cash_correction();

revoke all on function private.finance_payroll_credit(numeric,text,date,jsonb),private.guard_finance_payroll_cash_allocation(),private.preserve_finance_payroll_cash_correction() from public,anon,authenticated,service_role;
revoke all on function public.get_finance_payroll_cash(uuid,uuid,date),public.record_finance_payroll_advance(uuid,uuid,jsonb),
  public.get_finance_payroll_payment(uuid,uuid,date,jsonb),public.record_finance_payroll_payment(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_payroll_cash(uuid,uuid,date),public.record_finance_payroll_advance(uuid,uuid,jsonb),
  public.get_finance_payroll_payment(uuid,uuid,date,jsonb),public.record_finance_payroll_payment(uuid,uuid,uuid,jsonb) to authenticated;
