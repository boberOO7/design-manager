create or replace function public.confirm_finance_expense_receipt(p_studio_id uuid,p_request_id uuid,p_kind text,p_source_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare source jsonb; receipt public.finance_expense_receipts; result uuid; boundary date; project uuid; occurred date:=(p_input->>'date')::date;
  base text; receipt_fx jsonb; receipt_value numeric; valuation record;
  payload jsonb:=jsonb_build_object('operation','expense_receipt','kind',p_kind,'sourceId',p_source_id,'input',p_input);
begin
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);if result is not null then return result;end if;
  select recognition_start_month,base_currency into boundary,base from public.finance_settings where studio_id=p_studio_id and finalized_at is not null;

  if coalesce((p_input->>'confirmed')::boolean,false) is not true or occurred is null
    or occurred>(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_input_invalid';end if;
  source:=private.finance_expense_source(p_studio_id,p_kind,p_source_id);
  if source is null then raise exception 'finance_expense_source_invalid';end if;
  if source->>'scheduleId' is not null then raise exception 'finance_expense_service_period_required';end if;
  if source->>'version' is distinct from p_input->>'version' then raise exception 'finance_version_conflict';end if;
  project:=coalesce((source->>'projectId')::uuid,nullif(p_input->>'projectId','')::uuid);
  if source->>'projectId' is not null and nullif(p_input->>'projectId','') is not null and project::text is distinct from p_input->>'projectId' then raise exception 'finance_project_invalid';end if;
  select * into receipt from public.finance_expense_receipts where studio_id=p_studio_id
    and (expected_item_id=private.finance_recognition_expected_root(p_studio_id,p_source_id) and p_kind='expected' or movement_id=p_source_id and p_kind='movement');
  if receipt.id is not null then
    if receipt.occurred_on<>occurred or receipt.project_id is distinct from project or receipt.source_version is distinct from source->>'version' then raise exception 'finance_request_conflict';end if;
    result:=receipt.id;
  else
    if (source->>'consumed')::numeric<>0 then raise exception 'finance_expense_manual_history';end if;
    if private.finance_expense_period_reviewed(p_studio_id,project,occurred,occurred) and not coalesce((p_input->>'approveReviewed')::boolean,false) then
      raise exception 'finance_expense_history_protected';end if;
    if source->>'currency'=base or p_input->'fx' is not null and p_input->'fx'<>'null'::jsonb then
      select * into valuation from private.finance_valuation(source->>'currency',base,occurred,(source->>'amount')::numeric,p_input->'fx');
      receipt_fx:=jsonb_build_object('rate',valuation.rate::text,'source',valuation.source,'effectiveDate',valuation.effective_date);
      receipt_value:=valuation.reporting_amount;
    end if;
    insert into public.finance_expense_receipts(studio_id,expected_item_id,movement_id,occurred_on,project_id,source_version,snapshot,created_by)
      values(p_studio_id,case when p_kind='expected' then private.finance_recognition_expected_root(p_studio_id,p_source_id) end,case when p_kind='movement' then p_source_id end,occurred,project,source->>'version',source||jsonb_build_object('receiptFx',receipt_fx,'receiptReportingAmount',receipt_value::text),auth.uid()) returning id into result;
    if private.finance_posting_eligible(p_studio_id,occurred,clock_timestamp()) then
    perform private.post_finance_recognition_core(p_studio_id,jsonb_build_object('sourceKind',p_kind,'sourceId',p_source_id,'projectId',project,
      'classification',case when project is null then 'overhead' else 'direct_cost' end,'amount',source->>'amount','date',occurred,
      'periodStart',occurred,'periodEnd',occurred,'description',source->>'label','reason','Confirmed actual product or service receipt','fx',p_input->'fx'),auth.uid(),result,null);
    end if;
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());return result;
end $$;

-- Reuse the FX confirmed with the source instead of substituting a later quote.
alter function public.get_finance_source_calculations(uuid) rename to get_finance_source_calculations_before_fx;
alter function public.get_finance_source_calculations_before_fx(uuid) set schema private;
revoke all on function private.get_finance_source_calculations_before_fx(uuid) from public,anon,authenticated,service_role;
create function public.get_finance_source_calculations(p_studio_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c jsonb; result jsonb:='[]'; fx jsonb; value numeric; valuation record;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required';end if;
  for c in select * from jsonb_array_elements(private.get_finance_source_calculations_before_fx(p_studio_id)) loop
    fx:=null;value:=null;
    if c->>'amount' is not null and c->>'id' like 'earning:%' then
      select nullif(r.payload->'input'->'fx','null'::jsonb) into fx from public.finance_planning_requests r
        where r.studio_id=p_studio_id and r.result_id=(c->>'sourceId')::uuid and r.payload->>'operation'='earning_fulfillment'
          and r.payload->'input'->'fx' is not null and r.payload->'input'->'fx'<>'null'::jsonb
        order by r.created_at,r.request_id limit 1;
      if fx is not null then
        begin
          select * into valuation from private.finance_valuation(c->>'currency',c->>'reportingCurrency',(c->>'date')::date,(c->>'amount')::numeric,fx);
          value:=valuation.reporting_amount;
        exception when data_exception or raise_exception then value:=null;
        end;
      end if;
    elsif c->>'amount' is not null and c->>'id' like 'receipt:%' then
      select nullif(snapshot->'receiptFx','null'::jsonb),(snapshot->>'receiptReportingAmount')::numeric into fx,value
        from public.finance_expense_receipts where studio_id=p_studio_id and id=(c->>'sourceId')::uuid;
    end if;
    if fx is not null then c:=c||jsonb_build_object('reportingAmount',value::text,'valuationProvided',true);end if;
    result:=result||jsonb_build_array(c);
  end loop;
  return result;
end $$;
revoke all on function public.get_finance_source_calculations(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_source_calculations(uuid) to authenticated;
notify pgrst,'reload schema';
