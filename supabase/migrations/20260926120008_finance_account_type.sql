-- Account type is classification metadata; existing accounts default to other.
alter table public.finance_accounts add column account_type text not null default 'other'
  constraint finance_accounts_account_type_check check (account_type in ('bank','cash','payment_service','other'));

-- Preserve the original RPC name and positional callers. The default value also
-- preserves audit payloads for requests made before the type field existed.
drop function public.save_finance_account(uuid,text,text,numeric,uuid,uuid);
create function public.save_finance_account(
  p_studio_id uuid, p_name text, p_currency text, p_opening_balance numeric,
  p_account_id uuid default null, p_request_id uuid default null, p_account_type text default 'other'
) returns uuid language plpgsql security definer set search_path='' as $$
declare account_id uuid; payload jsonb;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_account_type is null or p_account_type not in ('bank','cash','payment_service','other')
    then raise exception 'finance_account_type_invalid'; end if;
  payload:=jsonb_build_object('operation','account_create','name',btrim(p_name),'currency',p_currency,'openingBalance',p_opening_balance);
  if p_account_type<>'other' then payload:=payload||jsonb_build_object('accountType',p_account_type); end if;
  perform 1 from public.finance_settings where studio_id=p_studio_id for update;
  if not found then raise exception 'finance_setup_required'; end if;
  if p_account_id is null then
    if p_request_id is null then raise exception 'finance_request_required'; end if;
    account_id:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
    if account_id is not null then return account_id; end if;
    insert into public.finance_accounts(studio_id,name,currency,account_type,opening_balance,created_by)
    values(p_studio_id,btrim(p_name),p_currency,p_account_type,p_opening_balance,auth.uid()) returning id into account_id;
    insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,account_id,auth.uid(),now());
  else
    update public.finance_accounts set name=btrim(p_name),currency=p_currency,account_type=p_account_type,opening_balance=p_opening_balance
    where id=p_account_id and studio_id=p_studio_id and archived_at is null returning id into account_id;
    if not found then raise exception 'finance_account_unavailable'; end if;
  end if;
  return account_id;
end $$;
revoke all on function public.save_finance_account(uuid,text,text,numeric,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_account(uuid,text,text,numeric,uuid,uuid,text) to authenticated;

-- The finalized create path stores the same metadata without changing its ledger entry.
create or replace function public.create_finance_account_with_opening(p_studio_id uuid,p_request_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; payload jsonb; result uuid; amount numeric; day date; account_name text; account_currency text; account_type text;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  payload:=jsonb_build_object('operation','account_create_dated','input',p_input);
  result:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
  if result is not null then return result; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id;
  if setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'finance_input_invalid'; end if;
  account_name:=btrim(p_input->>'name');
  account_currency:=p_input->>'currency';
  account_type:=coalesce(p_input->>'accountType','other');
  amount:=(p_input->>'openingBalance')::numeric;
  day:=(p_input->>'date')::date;
  if account_name is null or char_length(account_name) not between 1 and 120
    or account_currency is null or account_type not in ('bank','cash','payment_service','other') or amount is null or amount <> round(amount,4)
    or amount not between -9999999999.9999 and 9999999999.9999
    or day is null or day<setup.cutover_date or day>(now() at time zone 'Europe/Kyiv')::date
    then raise exception 'finance_input_invalid'; end if;
  insert into public.finance_accounts(studio_id,name,currency,account_type,opening_balance,created_by)
  values(p_studio_id,account_name,account_currency,account_type,0,auth.uid()) returning id into result;
  if amount<>0 then
    perform private.post_finance_account_balance(p_studio_id,p_request_id,result,'account_opening',day,amount,'',p_input->'fx',p_input);
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
