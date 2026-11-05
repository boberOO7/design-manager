-- Applying frozen salary advances does not exchange money or need current FX.
create or replace function public.get_finance_payroll_payment(p_studio_id uuid,p_item_id uuid,p_date date,p_fx jsonb default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.finance_obligations;item public.finance_expected_balances;rate numeric; available numeric;total numeric;
  credits jsonb; revision integer; result jsonb; payment_currency text:=coalesce(p_fx->>'paymentCurrency','UAH');digits integer;credit_only boolean;
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
  select minor_units into digits from public.finance_currencies where code=payment_currency;
  if digits is null then raise exception 'finance_input_invalid';end if;
  credit_only:=coalesce((p_fx->>'creditOnly')::boolean,false) or available>=item.remaining_amount;
  if credit_only then
    p_fx:=jsonb_build_object('paymentCurrency',payment_currency,'creditOnly',true);
    if item.currency=payment_currency then rate:=1;end if;
  elsif item.currency=payment_currency then
    rate:=1;
    p_fx:=jsonb_build_object('paymentCurrency',payment_currency,'rate','1','source','identity','effectiveDate',p_date);
  elsif p_fx->>'rate' is not null then
    rate:=private.finance_payroll_credit((p_fx->>'rate')::numeric,item.currency,p_date,p_fx);
  end if;
  total:=round(item.remaining_amount*rate,digits);
  result:=jsonb_build_object('obligationId',o.id,'employeeId',o.employee_id,'employeeName',o.employee_name,'currency',item.currency,
    'remaining',item.remaining_amount::text,'revision',revision,'version',item.version,'date',p_date,'rate',rate::text,'fx',p_fx,
    'advanceAvailable',available::text,'advanceUsed',least(available,item.remaining_amount)::text,'totalUah',case when payment_currency='UAH' then total::text end,'totalPayment',total::text,'paymentCurrency',payment_currency,
    'cashDue',case when credit_only then '0' else round((item.remaining_amount-available)*rate,digits)::text end,'credits',credits);
  return result||jsonb_build_object('digest',md5(result::text));
end $$;

create or replace function public.record_finance_payroll_payment(p_studio_id uuid,p_request_id uuid,p_item_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','payroll_payment','item',p_item_id,'input',p_input);result uuid;
  preview jsonb; before_confirmation jsonb; earning jsonb; account public.finance_accounts;payment record;movement uuid;employee uuid;category uuid;
  cash numeric:=(p_input->>'amount')::numeric; day date:=(p_input->>'date')::date;rate numeric;
  total numeric;remaining numeric;used numeric:=0;settled numeric:=0;part numeric;equivalent numeric;salary_currency text;payment_currency text;digits integer;
  previous_settlement text:=current_setting('studioflow.finance_payroll_settlement',true);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  preview:=public.get_finance_payroll_payment(p_studio_id,p_item_id,day,p_input->'payrollFx');
  if preview is null or preview->>'digest' is distinct from p_input->>'digest' then raise exception 'finance_payroll_preview_stale';end if;
  -- One user action: freeze the reviewed production and settle it atomically.
  -- Old clients/confirmed salaries keep the existing payment-only path.
  if nullif(p_input->>'earningDigest','') is not null then
    earning:=public.get_finance_payroll_period(p_studio_id,(preview->>'obligationId')::uuid);
    if earning->'current'->>'payMethod' is distinct from 'per_m2'
      or earning->'confirmed' is distinct from 'null'::jsonb
      or earning->'current'->>'digest' is distinct from p_input->>'earningDigest'
      then raise exception 'finance_payroll_preview_stale';end if;
    before_confirmation:=preview;
    perform public.confirm_finance_payroll_earning(p_studio_id,gen_random_uuid(),jsonb_build_object(
      'obligationId',preview->>'obligationId','revision',0,'digest',p_input->>'earningDigest',
      'finalAmount',earning->'current'->>'calculatedAmount','refreshSource',false,'reason',p_input->>'earningReason'));
    preview:=public.get_finance_payroll_payment(p_studio_id,p_item_id,day,p_input->'payrollFx');
    -- Confirmation changes version/revision, but must not silently change what the user reviewed.
    if (preview - 'digest' - 'revision' - 'version') is distinct from
       (before_confirmation - 'digest' - 'revision' - 'version') then
      raise exception 'finance_payroll_preview_stale';
    end if;
  end if;
  payment_currency:=preview->>'paymentCurrency';
  select minor_units into digits from public.finance_currencies where code=payment_currency;
  if cash is null or cash<0 or cash>9999999999.9999 or cash<>round(cash,digits) then raise exception 'finance_amount_invalid';end if;
  total:=(preview->>'totalPayment')::numeric; remaining:=(preview->>'remaining')::numeric;rate:=(preview->>'rate')::numeric;
  if remaining<=0 then raise exception 'finance_amount_invalid';end if;
  if cash>0 and (total is null or rate is null or total<=0) then raise exception 'finance_fx_required';end if;
  employee:=(preview->>'employeeId')::uuid;salary_currency:=preview->>'currency';
  if cash>(preview->>'cashDue')::numeric then raise exception 'finance_overallocation';end if;
  if cash=0 and (preview->>'advanceAvailable')::numeric<=0 then raise exception 'finance_amount_invalid';end if;
  if cash>0 then
    select * into account from public.finance_accounts where studio_id=p_studio_id and id=(p_input->>'accountId')::uuid and archived_at is null;
    if account.id is null or account.currency is distinct from payment_currency then raise exception 'finance_input_invalid';end if;
    select category_id into category from public.finance_expected_items where studio_id=p_studio_id and id=p_item_id and commitment<>'cancelled';
    if category is null then raise exception 'finance_input_invalid';end if;
    movement:=public.record_finance_movement(p_studio_id,p_request_id,jsonb_build_object('kind','outgoing','date',day,'accountId',account.id,
      'amount',cash,'categoryId',category,'description',p_input->>'note','allocationIntent',true,'payrollFx',p_input->'payrollFx','payrollCreditCurrency',salary_currency,'fx',p_input->'fx'));
    rate:=private.finance_payroll_credit(cash,salary_currency,day,p_input->'payrollFx');
    insert into public.finance_payroll_cash(studio_id,movement_id,employee_id,obligation_id,credit_currency,credit_amount,credit_rate,credit_source,created_by)
      values(p_studio_id,movement,employee,(preview->>'obligationId')::uuid,salary_currency,round(cash/rate,2),rate,case when salary_currency=account.currency then 'identity' else p_input->'payrollFx'->>'source' end,auth.uid());
  end if;
  perform set_config('studioflow.finance_payroll_settlement','on',true);
  -- Old advances first, using their frozen original salary-currency amount and rate.
  for payment in select p.*,a.currency as payment_currency,c.minor_units from public.finance_payroll_credit_availability p
    join public.finance_payment_availability a on a.studio_id=p.studio_id and a.id=p.movement_id
    join public.finance_currencies c on c.code=a.currency
    where p.studio_id=p_studio_id and p.employee_id=employee and p.credit_currency=salary_currency and (p.obligation_id is null or p.obligation_id=(preview->>'obligationId')::uuid) and p.financial_date<=day and p.credit_available>0 and p.unapplied_amount>0
    order by (p.movement_id=movement) nulls first,p.financial_date,p.movement_id
  loop
    exit when settled>=remaining;
    equivalent:=least(payment.credit_available,remaining-settled);
    part:=case when equivalent=payment.credit_available then payment.unapplied_amount
      else least(payment.unapplied_amount,round(payment.unapplied_amount*equivalent/payment.credit_available,payment.minor_units)) end;
    if part<=0 then raise exception 'finance_allocation_precision';end if;
    insert into public.finance_allocations(studio_id,expected_item_id,movement_id,amount,payment_amount,payment_currency,obligation_currency,
      settlement_rate,settlement_source,settlement_effective_date,created_by)
    values(p_studio_id,p_item_id,payment.movement_id,equivalent,part,payment.payment_currency,salary_currency,case when salary_currency=payment.payment_currency then 1 else round(1/payment.credit_rate,10) end,
      payment.credit_source,payment.financial_date,auth.uid());
    used:=used+part;settled:=settled+equivalent;
  end loop;
  perform set_config('studioflow.finance_payroll_settlement',coalesce(previous_settlement,''),true);
  if used=0 then raise exception 'finance_amount_invalid';end if;
  result:=coalesce(movement,p_item_id);
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
