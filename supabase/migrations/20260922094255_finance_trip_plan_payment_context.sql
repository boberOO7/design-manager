-- Qualify the stored plan kind independently of the requested entry kind.
create or replace function public.record_finance_trip_entry(p_studio_id uuid,p_request_id uuid,p_trip_id uuid,p_input jsonb) returns uuid
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

