-- Balance start is a cash boundary, never a reporting/history boundary.
-- This private, transaction-scoped context is writable only by the guarded RPC.
-- A caller-controlled session setting must not unlock finalized opening stock.
create table private.finance_cutover_context (
  studio_id uuid primary key references public.finance_settings(studio_id) on delete cascade
);
revoke all on private.finance_cutover_context from public,anon,authenticated,service_role;

create or replace function private.guard_finance_settings()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.studio_id is distinct from old.studio_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'finance_identity_immutable';
  end if;
  if old.finalized_at is not null and (
    new.base_currency is distinct from old.base_currency
    or (new.cutover_date is distinct from old.cutover_date
      and not exists(select 1 from private.finance_cutover_context where studio_id=old.studio_id))
    or new.finalized_at is distinct from old.finalized_at
    or new.finalized_by is distinct from old.finalized_by
  ) and not (
    new.base_currency is not distinct from old.base_currency
    and new.cutover_date is not distinct from old.cutover_date
    and new.finalized_at is null and new.finalized_by is null
    and not private.finance_has_substantive_history(old.studio_id)
  ) then raise exception 'finance_setup_finalized'; end if;

  if new.cutover_date is distinct from old.cutover_date
    and exists(select 1 from public.finance_accounts where studio_id=old.studio_id)
    and not exists(select 1 from private.finance_cutover_context where studio_id=old.studio_id)
    then raise exception 'finance_opening_cutover_locked'; end if;
  if old.finalized_at is null and new.base_currency is distinct from old.base_currency
    and (private.finance_has_substantive_history(old.studio_id)
      or (exists(select 1 from private.finance_reopen_origin where studio_id=old.studio_id)
        and exists(select 1 from public.finance_accounts where studio_id=old.studio_id and opening_balance<>0))
      or exists(select 1 from public.finance_budget_revisions where studio_id=old.studio_id)
      or exists(select 1 from public.finance_forecast_snapshots where studio_id=old.studio_id)
      or exists(select 1 from public.finance_trip_entries where studio_id=old.studio_id))
    then raise exception 'finance_base_currency_locked'; end if;
  return new;
end;
$$;

create or replace function private.guard_finance_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare setup_finalized_at timestamptz; precision_digits integer;
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id or new.studio_id is distinct from old.studio_id
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
  ) then raise exception 'finance_identity_immutable'; end if;

  -- Serialize account changes with setup edits/finalization, including direct writes.
  select finalized_at into setup_finalized_at from public.finance_settings
  where studio_id = new.studio_id for update;
  if not found then raise exception 'finance_setup_required'; end if;
  if setup_finalized_at is not null then
    if tg_op = 'INSERT' and new.opening_balance <> 0 then
      raise exception 'finance_new_account_zero_opening';
    elsif tg_op = 'UPDATE' and (
      new.currency is distinct from old.currency or (new.opening_balance is distinct from old.opening_balance
        and not exists(select 1 from private.finance_cutover_context where studio_id=new.studio_id))
    ) then raise exception 'finance_opening_locked'; end if;
  end if;
  select minor_units into precision_digits from public.finance_currencies where code = new.currency;
  if not found then raise exception 'finance_currency_invalid'; end if;
  if new.opening_balance <> round(new.opening_balance, precision_digits) then
    raise exception 'finance_balance_precision';
  end if;
  return new;
end;
$$;

create or replace function private.guard_finance_opening_valuation() returns trigger
language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; digits integer;
begin
  select * into setup from public.finance_settings where studio_id=new.studio_id for update;
  if tg_op='UPDATE' then
    if setup.finalized_at is not null and old.opening_reporting_amount is not null
      and not exists(select 1 from private.finance_cutover_context where studio_id=new.studio_id) and
      row(new.opening_reporting_amount,new.opening_fx_rate,new.opening_fx_source,new.opening_fx_effective_date,new.opening_valued_at,new.opening_valued_by)
      is distinct from row(old.opening_reporting_amount,old.opening_fx_rate,old.opening_fx_source,old.opening_fx_effective_date,old.opening_valued_at,old.opening_valued_by)
      then raise exception 'finance_opening_valuation_locked'; end if;
    if setup.finalized_at is null
      and not exists(select 1 from private.finance_cutover_context where studio_id=new.studio_id) and (new.currency is distinct from old.currency or new.opening_balance is distinct from old.opening_balance) then
      new.opening_reporting_amount:=null; new.opening_fx_rate:=null; new.opening_fx_source:=null;
      new.opening_fx_effective_date:=null; new.opening_valued_at:=null; new.opening_valued_by:=null;
    end if;
  end if;
  if new.opening_reporting_amount is not null then
    select minor_units into digits from public.finance_currencies where code=setup.base_currency;
    if new.currency=setup.base_currency or new.opening_balance=0
      or new.opening_fx_effective_date is distinct from setup.cutover_date
      or (new.opening_fx_source='nbu' and setup.base_currency<>'UAH')
      or new.opening_reporting_amount is distinct from round(new.opening_balance*new.opening_fx_rate,digits)
      then raise exception 'finance_opening_fx_invalid'; end if;
  end if;
  return new;
end $$;

create or replace function private.clear_draft_finance_opening_valuations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.finalized_at is null
    and not exists(select 1 from private.finance_cutover_context where studio_id=new.studio_id) and (new.base_currency is distinct from old.base_currency or new.cutover_date is distinct from old.cutover_date) then
    update public.finance_accounts set opening_reporting_amount=null,opening_fx_rate=null,opening_fx_source=null,
      opening_fx_effective_date=null,opening_valued_at=null,opening_valued_by=null
    where studio_id=new.studio_id and opening_reporting_amount is not null;
  end if;
  return new;
end $$;

-- Keep lifetime entry count for the existing "untouched account" guard.
-- Only the signed balance sum is restricted to the current balance start.
create or replace view public.finance_account_balances with (security_invoker=true) as
select a.id,a.studio_id,a.name,a.currency,a.archived_at,a.opening_balance,
  a.opening_balance+coalesce(sum(e.amount) filter(where m.financial_date>=s.cutover_date),0) as recorded_balance,
  count(e.id) as ledger_entry_count
from public.finance_accounts a
join public.finance_settings s on s.studio_id=a.studio_id
left join public.finance_movement_entries e on e.studio_id=a.studio_id and e.account_id=a.id
left join public.finance_movements m on m.studio_id=e.studio_id and m.id=e.movement_id
group by a.id;

-- All accounts (including archived cash pools), cutover and opening FX are
-- committed together under the same parent lock as cash posting and account edits.
create function public.change_finance_cutover(p_studio_id uuid,p_request_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; account public.finance_accounts; item jsonb;
  day date; amount numeric; rate numeric; source text; effective date; digits integer;
  result uuid; payload jsonb:=jsonb_build_object('operation','balance_cutover','input',p_input);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  if p_input is null or jsonb_typeof(p_input)<>'object'
    or jsonb_typeof(p_input->'accounts') is distinct from 'array'
    or (p_input->>'confirmed') is distinct from 'true' then raise exception 'finance_input_invalid'; end if;
  day:=(p_input->>'date')::date;
  if day is null or day not between date '1900-01-01' and date '9999-12-31' then raise exception 'finance_input_invalid'; end if;
  if setup.finalized_at is not null and day>(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_cutover_future'; end if;
  if setup.cutover_date is distinct from (p_input->>'previousDate')::date
    or setup.base_currency is distinct from p_input->>'reportingCurrency'
    or setup.updated_at is distinct from (p_input->>'settingsUpdatedAt')::timestamptz
    then raise exception 'finance_setup_context_changed'; end if;
  if jsonb_array_length(p_input->'accounts')<>(select count(*) from public.finance_accounts where studio_id=p_studio_id)
    or exists(select 1 from jsonb_array_elements(p_input->'accounts') x group by x->>'accountId' having count(*)>1)
    then raise exception 'finance_setup_context_changed'; end if;

  insert into private.finance_cutover_context values(p_studio_id);
  update public.finance_settings set cutover_date=day where studio_id=p_studio_id;
  select minor_units into digits from public.finance_currencies where code=setup.base_currency;
  for item in select value from jsonb_array_elements(p_input->'accounts') loop
    select * into account from public.finance_accounts where studio_id=p_studio_id and id=(item->>'accountId')::uuid;
    if not found or account.currency is distinct from item->>'currency'
      or account.updated_at is distinct from (item->>'updatedAt')::timestamptz
      then raise exception 'finance_setup_context_changed'; end if;
    if item->>'amount' is null or (item->>'amount')!~'^-?[0-9]{1,10}(\.[0-9]{1,4})?$'
      then raise exception 'finance_input_invalid'; end if;
    amount:=(item->>'amount')::numeric;
    rate:=null; source:=null; effective:=null;
    if amount<>0 and account.currency<>setup.base_currency then
      rate:=(item->'fx'->>'rate')::numeric; source:=item->'fx'->>'source'; effective:=(item->'fx'->>'effectiveDate')::date;
      if rate is null or not(rate>0 and rate<=1000000000) or rate<>round(rate,10)
        or source is null or source not in ('manual','nbu') or effective is distinct from day
        or (source='nbu' and setup.base_currency<>'UAH') then raise exception 'finance_opening_fx_invalid'; end if;
    end if;
    update public.finance_accounts set opening_balance=amount,
      opening_reporting_amount=case when rate is not null then round(amount*rate,digits) end,
      opening_fx_rate=rate,opening_fx_source=source,opening_fx_effective_date=effective,
      opening_valued_at=case when rate is not null then now() end,
      opening_valued_by=case when rate is not null then auth.uid() end
    where studio_id=p_studio_id and id=account.id;
  end loop;
  delete from private.finance_cutover_context where studio_id=p_studio_id;
  result:=gen_random_uuid();
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
revoke all on function public.change_finance_cutover(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.change_finance_cutover(uuid,uuid,jsonb) to authenticated;

-- Actual posting and reporting preserve original transaction dates.
create or replace function public.record_finance_movement(p_studio_id uuid,p_request_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare setup public.finance_settings; existing public.finance_movements; original public.finance_movements;
  original_entry public.finance_movement_entries; movement_id uuid; kind text; nature text; day date;
  amount numeric; received numeric; fee numeric; account_id uuid; destination_id uuid; related_id uuid;
  source_currency text; destination_currency text; refunded numeric;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  -- Same parent-first lock as Phase 1: finalization, archival, retries and refunds serialize.
  select * into setup from public.finance_settings where studio_id=p_studio_id for update;
  if not found or setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  if p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'finance_input_invalid'; end if;
  select * into existing from public.finance_movements where studio_id=p_studio_id and request_id=p_request_id;
  if found then
    if existing.request_payload is distinct from p_input then raise exception 'finance_request_conflict'; end if;
    return existing.id;
  end if;
  kind:=p_input->>'kind'; nature:=p_input->>'nature'; day:=(p_input->>'date')::date;
  amount:=(p_input->>'amount')::numeric; fee:=coalesce((p_input->>'fee')::numeric,0);
  account_id:=(p_input->>'accountId')::uuid; related_id:=nullif(p_input->>'relatedMovementId','')::uuid;
  if kind is null or kind not in ('incoming','outgoing','transfer','owner_withdrawal','refund')
    or day is null or day not between date '1900-01-01' and date '9999-12-31' or day>(now() at time zone 'Europe/Kyiv')::date
    or amount is null or not (amount>0 and amount<=9999999999.9999)
    or not (fee>=0 and fee<=9999999999.9999) then raise exception 'finance_input_invalid'; end if;
  if kind='transfer' then nature:='transfer';
  elsif kind='owner_withdrawal' then nature:='owner_distribution';
  elsif kind='refund' then
    select * into original from public.finance_movements where studio_id=p_studio_id and id=related_id;
    if not found or original.kind not in ('incoming','outgoing') or day<original.financial_date
      or exists(select 1 from public.finance_movements r where r.studio_id=p_studio_id and r.kind='reversal' and r.related_movement_id=original.id)
      then raise exception 'finance_refund_unavailable'; end if;
    select * into original_entry from public.finance_movement_entries e where e.studio_id=p_studio_id and e.movement_id=original.id and e.entry_role='primary';
    if account_id is distinct from original_entry.account_id then raise exception 'finance_refund_account'; end if;
    select coalesce(sum(abs(e.amount)),0) into refunded from public.finance_movements m
      join public.finance_movement_entries e on e.studio_id=m.studio_id and e.movement_id=m.id
      where m.studio_id=p_studio_id and m.kind='refund' and m.related_movement_id=original.id
      and not exists(select 1 from public.finance_movements r where r.studio_id=p_studio_id and r.kind='reversal' and r.related_movement_id=m.id);
    if refunded+amount>abs(original_entry.amount) then raise exception 'finance_refund_exceeds_original'; end if;
    nature:=original.nature;
  end if;
  if kind<>'transfer' and (fee<>0 or nullif(p_input->>'destinationId','') is not null
    or nullif(p_input->>'receivedAmount','') is not null) then raise exception 'finance_input_invalid'; end if;
  insert into public.finance_movements(studio_id,request_id,request_payload,kind,nature,financial_date,category,description,related_movement_id,created_by)
  values(p_studio_id,p_request_id,p_input,kind,nature,day,btrim(p_input->>'category'),coalesce(p_input->>'description',''),related_id,auth.uid())
  returning id into movement_id;
  perform private.add_finance_entry(p_studio_id,movement_id,account_id,'primary',
    case when kind='incoming' or (kind='refund' and original_entry.amount<0) then amount else -amount end,p_input->'fx');
  if kind='transfer' then
    destination_id:=(p_input->>'destinationId')::uuid; received:=(p_input->>'receivedAmount')::numeric;
    if destination_id is null or destination_id=account_id or received is null or not (received>0 and received<=9999999999.9999)
      then raise exception 'finance_transfer_invalid'; end if;
    select currency into source_currency from public.finance_accounts where studio_id=p_studio_id and id=account_id;
    select currency into destination_currency from public.finance_accounts where studio_id=p_studio_id and id=destination_id;
    if source_currency=destination_currency and received<>amount then raise exception 'finance_transfer_amount_mismatch'; end if;
    perform private.add_finance_entry(p_studio_id,movement_id,destination_id,'destination',received,
      case when source_currency=destination_currency then p_input->'fx' else p_input->'destinationFx' end);
    if fee>0 then perform private.add_finance_entry(p_studio_id,movement_id,account_id,'fee',-fee,p_input->'fx'); end if;
  end if;
  return movement_id;
end;
$$;

create or replace function public.record_finance_trip_entry(p_studio_id uuid,p_request_id uuid,p_trip_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','trip_entry','trip',p_trip_id,'input',p_input); result uuid;
  setup public.finance_settings; trip public.finance_trips; original public.finance_trip_entries; plan public.finance_trip_entries;
  payment public.finance_payment_availability; entry public.finance_movement_entries; valuation record;
  kind text:=p_input->>'kind'; day date:=(p_input->>'date')::date; amount numeric:=(p_input->>'amount')::numeric;
  currency text:=p_input->>'currency'; employee uuid:=nullif(p_input->>'employeeId','')::uuid; movement uuid; expected uuid; category uuid; digits integer; a record; covered uuid[]:='{}'; coverage integer:=1;
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
    insert into public.finance_trip_entries(id,studio_id,trip_id,kind,expense_type,label,amount,currency,financial_date,employee_id,reverses_id,note,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,daily_rate,day_count,traveler_count,created_by)
    values(result,p_studio_id,p_trip_id,original.kind,original.expense_type,original.label,-original.amount,original.currency,original.financial_date,original.employee_id,original.id,btrim(p_input->>'note'),original.reporting_currency,-original.reporting_amount,original.fx_rate,original.fx_source,original.fx_effective_date,original.daily_rate,original.day_count,original.traveler_count,auth.uid());
  else
    if nullif(p_input->>'dailyRate','') is not null and p_input ? 'coveredTravelerIds' then
      if jsonb_typeof(p_input->'coveredTravelerIds') is distinct from 'array' then raise exception 'finance_trip_traveler_invalid'; end if;
      select array_agg(distinct value::uuid) into covered from jsonb_array_elements_text(p_input->'coveredTravelerIds');
      coverage:=coalesce(cardinality(covered),0);
      if coverage not between 1 and 100 or exists(select 1 from unnest(covered) u where not exists(select 1 from public.finance_trip_travelers v where v.studio_id=p_studio_id and v.trip_id=p_trip_id and v.employee_id=u and v.active)) then raise exception 'finance_trip_traveler_invalid'; end if;
    end if;
    if trip.status='cancelled' then raise exception 'finance_trip_closed'; end if;
    select minor_units into digits from public.finance_currencies where code=currency;
    if kind is null or kind not in ('plan','expense','advance') or day is null or (kind<>'plan' and (day not between date '1900-01-01' and date '9999-12-31' or day>(now() at time zone 'Europe/Kyiv')::date))
      or digits is null or amount is null or not(amount>0 and amount<=9999999999.9999) or amount<>round(amount,digits) then raise exception 'finance_amount_invalid'; end if;
    if employee is not null and not exists(select 1 from public.finance_trip_travelers where studio_id=p_studio_id and trip_id=p_trip_id and employee_id=employee and active) then raise exception 'finance_trip_traveler_invalid'; end if;
    if kind='advance' and employee is null then raise exception 'finance_trip_traveler_invalid'; end if;
    if kind='plan' and (employee is not null or nullif(p_input->>'movementId','') is not null or nullif(p_input->>'accountId','') is not null) then raise exception 'finance_input_invalid'; end if;
    if kind='expense' and employee is not null and (nullif(p_input->>'movementId','') is not null or nullif(p_input->>'accountId','') is not null) then raise exception 'finance_input_invalid'; end if;
    if nullif(p_input->>'planId','') is not null then
      select * into plan from public.finance_trip_entries where studio_id=p_studio_id and trip_id=p_trip_id and id=(p_input->>'planId')::uuid and finance_trip_entries.kind='plan' and reverses_id is null;
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
      if kind='plan' and currency<>setup.base_currency then
        select null::numeric as rate,null::text as source,null::date as effective_date,null::numeric as reporting_amount into valuation;
      else
        select * into valuation from private.finance_valuation(currency,setup.base_currency,day,amount,p_input->'fx');
      end if;
      if kind='plan' and nullif(p_input->>'expectedDate','') is not null then
        expected:=public.save_finance_expected_item(p_studio_id,gen_random_uuid(),jsonb_build_object('direction','outgoing','amount',amount,'currency',currency,'categoryId',category,'description',trip.title||' · '||coalesce(p_input->>'label',''),'expectedDate',p_input->>'expectedDate','commitment','tentative','certainty','estimated','established',false));
      end if;
    end if;
    insert into public.finance_trip_entries(id,studio_id,trip_id,kind,expense_type,label,amount,currency,financial_date,employee_id,movement_id,expected_item_id,plan_id,note,reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date,daily_rate,day_count,traveler_count,created_by)
    values(result,p_studio_id,p_trip_id,kind,p_input->>'expenseType',coalesce(p_input->>'label',''),amount,currency,day,employee,movement,expected,plan.id,coalesce(p_input->>'note',''),setup.base_currency,valuation.reporting_amount,valuation.rate,valuation.source,valuation.effective_date,nullif(p_input->>'dailyRate','')::numeric,nullif(p_input->>'dayCount','')::integer,coverage,auth.uid());
  end if;
  if original.id is not null then
    insert into public.finance_trip_entry_travelers select studio_id,trip_id,result,employee_id from public.finance_trip_entry_travelers where studio_id=p_studio_id and entry_id=original.id;
  elsif cardinality(covered)>0 then
    insert into public.finance_trip_entry_travelers select p_studio_id,p_trip_id,result,u from unnest(covered) u;
  end if;
  perform private.reconcile_finance_trip(p_studio_id,p_trip_id);
  perform set_config('studioflow.trip_reconcile',coalesce(previous,''),true);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now()); return result;
end $$;

create or replace function public.get_finance_overview(p_studio_id uuid,p_horizon text default '6',p_scenario text default 'confirmed',p_fx jsonb default '[]',p_period text default '3') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare report jsonb; today date; first_day date; last_day date; digits integer; result jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_period is null or p_period not in ('month','3','year') then raise exception 'finance_input_invalid'; end if;
  -- Also maintains automatic occurrences and takes the canonical Finance settings lock.
  report:=public.calculate_finance_forecast(p_studio_id,p_horizon,p_scenario,p_fx);
  today:=(report->>'asOf')::date; last_day:=(report->>'through')::date;
  first_day:=case p_period when 'month' then date_trunc('month',today)::date when 'year' then date_trunc('year',today)::date else (date_trunc('month',today)-interval '2 months')::date end;
  select minor_units into digits from public.finance_currencies where code=report->>'currency';
  with fx as (
    select * from jsonb_to_recordset(report->'fx') as f(currency text,rate numeric)
  ), accounts as (
    select b.id,b.name,b.currency,b.recorded_balance::text as native,round(b.recorded_balance*f.rate,digits)::text as amount
    from public.finance_account_balances b left join fx f on f.currency=b.currency where b.studio_id=p_studio_id
  ), receivables as (
    select i.id,i.description,i.currency,i.outstanding_amount::text as native,round(i.outstanding_amount*f.rate,digits)::text as amount,i.due_date as "dueDate",i.expected_payment_date as "expectedDate"
    from public.finance_expected_balances i left join fx f on f.currency=i.currency
    where i.studio_id=p_studio_id and i.direction='incoming' and i.outstanding_amount>0
  ), items as (
    select * from jsonb_to_recordset(report->'items') as i(id uuid,date date,direction text,"reportingAmount" numeric)
  ), opening as (
    select coalesce(sum(case when currency=report->>'currency' then opening_balance when opening_balance=0 then 0 else opening_reporting_amount end),0) as amount,
      coalesce(bool_or(currency<>report->>'currency' and opening_balance<>0 and opening_reporting_amount is null),false) as incomplete
    from public.finance_accounts where studio_id=p_studio_id
  ), effects as (
    select financial_date as date,sum(reporting_amount) as amount from public.finance_cash_effects
    where studio_id=p_studio_id and financial_date between (report->>'cutover')::date and today group by financial_date
  ), historical_dates as (
    select first_day as date union select today union select (report->>'cutover')::date where (report->>'cutover')::date between first_day and today
    union select date from effects where date>=first_day
    union select d::date from generate_series(first_day::timestamp,today::timestamp,interval '1 month') d
  ), history as (
    select d.date,case when d.date<(report->>'cutover')::date or (select incomplete from opening) then null else
      (select amount from opening)+coalesce((select sum(e.amount) from effects e where e.date<=d.date),0) end as amount
    from historical_dates d
  ), projected_dates as (
    select today as date union select last_day union select date from items where date between today and last_day
    union select (m->>'month')::date from jsonb_array_elements(report->'months') m where (m->>'month')::date>today
  ), projection as (
    select d.date,(report->>'cashBase')::numeric+coalesce((select sum(case when i.direction='incoming' then i."reportingAmount" else -i."reportingAmount" end) from items i where i.date between today and d.date),0) as amount
    from projected_dates d
  ), flows as (
    select date_trunc('month',financial_date)::date as month,nature,direction,sum(amount)::text as amount
    from public.finance_planning_actuals where studio_id=p_studio_id and financial_date between first_day and today group by 1,2,3
  ), categories as (
    select c.category_id as id,c.category as name,c.direction,c.nature,
      case when bool_and(c.budget is not null) and count(*)=jsonb_array_length(report->'months') then sum(c.budget)::text end as budget,
      sum(c.actual)::text as actual,sum(c.full_period)::text as forecast,bool_or(c.incomplete) as incomplete,
      case when bool_and(c.budget is not null) and count(*)=jsonb_array_length(report->'months') then (sum(c.full_period)-sum(c.budget))::text end as variance
    from jsonb_to_recordset(report->'comparisons') as c(category_id uuid,category text,direction text,nature text,budget numeric,actual numeric,full_period numeric,incomplete boolean)
    group by 1,2,3,4
  )
  select jsonb_build_object('forecast',report,'period',p_period,'actualFrom',first_day,'upcomingThrough',least(today+30,last_day),
    'historyIncomplete',(select incomplete from opening),
    'history',coalesce((select jsonb_agg(jsonb_build_object('date',date,'amount',amount::text) order by date) from history),'[]'),
    'projection',(select jsonb_agg(jsonb_build_object('date',date,'amount',amount::text) order by date) from projection),
    'lowPoint',(select jsonb_build_object('date',date,'amount',amount::text) from (select date,amount from projection union all select today,(report->>'cashBase')::numeric) p order by amount,date limit 1),
    'flows',coalesce((select jsonb_agg(to_jsonb(f) order by month,nature,direction) from flows f),'[]'),
    'netFlow',coalesce((select sum(case when direction='incoming' then amount::numeric else -amount::numeric end) from flows),0)::text,
    'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by name,id) from accounts a),'[]'),
    'receivables',coalesce((select jsonb_agg(to_jsonb(r) order by "dueDate" nulls last,id) from receivables r),'[]'),
    'receivableTotal',coalesce((select sum(amount::numeric) from receivables),0)::text,
    'receivablesIncomplete',exists(select 1 from receivables where amount is null),
    'outgoingTotal',coalesce((select sum("reportingAmount") from items where direction='outgoing' and date between today and least(today+30,last_day)),0)::text,
    'outgoingIncomplete',exists(select 1 from items where direction='outgoing' and date between today and least(today+30,last_day) and "reportingAmount" is null),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by abs(variance::numeric) desc nulls last,name) from categories c),'[]'),
    'requiredCurrencies',coalesce((select jsonb_agg(distinct currency) from receivables where amount is null),'[]')
  ) into result;
  return result;
end $$;
