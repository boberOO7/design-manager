-- One submission records a new bonus/other expectation and its receipt together.
create or replace function public.record_finance_project_income(
  p_studio_id uuid, p_request_id uuid, p_project_id uuid, p_input jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb := jsonb_build_object('operation','project_income','project',p_project_id,'input',p_input);
  result uuid;
  item jsonb := p_input->'item';
  receipt jsonb := p_input->'receipt';
  account_currency text;
  category_nature text;
begin
  result := private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or coalesce(p_input->>'stream','') not in ('contractor_bonus','other')
    or item is null or jsonb_typeof(item) <> 'object'
    or receipt is null or jsonb_typeof(receipt) <> 'object'
    or nullif(item->>'id','') is not null
    or item->>'direction' is distinct from 'incoming'
    or item->>'commitment' is distinct from 'agreed'
    or item->>'certainty' is distinct from 'fixed'
    or item->>'established' is distinct from 'true'
    then raise exception 'finance_input_invalid'; end if;

  select a.currency,c.nature into account_currency,category_nature
    from public.finance_accounts a cross join public.finance_categories c
    where a.studio_id=p_studio_id and a.id=(receipt->>'accountId')::uuid
      and c.studio_id=p_studio_id and c.id=(item->>'categoryId')::uuid;
  if not found or account_currency is distinct from item->>'currency'
    then raise exception 'finance_input_invalid'; end if;

  result := public.save_finance_project_item(p_studio_id,gen_random_uuid(),p_project_id,
    jsonb_build_object('stream',p_input->>'stream','source','manual',
      'contractorId',p_input->>'contractorId','item',item));
  perform public.record_finance_expected_payment(p_studio_id,gen_random_uuid(),result,
    jsonb_build_object('kind','incoming','nature',category_nature,'date',receipt->>'date',
      'accountId',receipt->>'accountId','amount',item->>'amount',
      'categoryId',item->>'categoryId','description',coalesce(item->>'description',''),
      'fx',receipt->'fx'));
  insert into public.finance_planning_requests
    values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end;
$$;

revoke all on function public.record_finance_project_income(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_finance_project_income(uuid,uuid,uuid,jsonb) to authenticated;
