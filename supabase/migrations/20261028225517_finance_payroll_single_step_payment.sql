-- Confirm calculated piecework earnings and record UAH cash/advance settlement in one transaction.
create or replace function public.record_finance_payroll_payment(p_studio_id uuid,p_request_id uuid,p_item_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('operation','payroll_payment','item',p_item_id,'input',p_input);result uuid;
  preview jsonb; before_confirmation jsonb; earning jsonb; account public.finance_accounts;payment record;movement uuid;employee uuid;category uuid;
  cash numeric:=(p_input->>'amount')::numeric; day date:=(p_input->>'date')::date;rate numeric;
  total numeric;remaining numeric;used numeric:=0;settled numeric:=0;part numeric;equivalent numeric;currency text;
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

revoke all on function public.record_finance_payroll_payment(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_finance_payroll_payment(uuid,uuid,uuid,jsonb) to authenticated;
