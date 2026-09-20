-- Create requests share Finance's immutable audit and studio lock. Edits keep
-- their existing behavior. No legacy create endpoint may generate unaudited IDs.
drop function public.save_finance_account(uuid,text,text,numeric,uuid);
create function public.save_finance_account(
  p_studio_id uuid, p_name text, p_currency text, p_opening_balance numeric, p_account_id uuid default null, p_request_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare account_id uuid; payload jsonb:=jsonb_build_object('operation','account_create','name',btrim(p_name),'currency',p_currency,'openingBalance',p_opening_balance);
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  perform 1 from public.finance_settings where studio_id = p_studio_id for update;
  if not found then raise exception 'finance_setup_required'; end if;
  if p_account_id is null then
    if p_request_id is null then raise exception 'finance_request_required'; end if;
    account_id:=private.begin_finance_planning(p_studio_id,p_request_id,payload);
    if account_id is not null then return account_id; end if;
    insert into public.finance_accounts(studio_id, name, currency, opening_balance, created_by)
    values (p_studio_id, btrim(p_name), p_currency, p_opening_balance, auth.uid()) returning id into account_id;
    insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,account_id,auth.uid(),now());
  else
    update public.finance_accounts set name = btrim(p_name), currency = p_currency, opening_balance = p_opening_balance
    where id = p_account_id and studio_id = p_studio_id and archived_at is null returning id into account_id;
    if not found then raise exception 'finance_account_unavailable'; end if;
  end if;
  return account_id;
end;
$$;

revoke all on function public.save_finance_account(uuid,text,text,numeric,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_finance_account(uuid,text,text,numeric,uuid,uuid) to authenticated;

-- Drafts may be future-dated. Guard the finalized transition, including direct
-- privileged writes, without rewriting existing history or opening valuations.
create or replace function private.guard_finance_opening_finalization() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.finalized_at is not null and (tg_op='INSERT' or old.finalized_at is null) then
    if new.cutover_date>(now() at time zone 'Europe/Kyiv')::date then raise exception 'finance_cutover_future'; end if;
    if tg_op='UPDATE' and (new.base_currency is distinct from old.base_currency or new.cutover_date is distinct from old.cutover_date)
      then raise exception 'finance_setup_context_changed'; end if;
    if exists(select 1 from public.finance_accounts a where a.studio_id=new.studio_id and a.currency<>new.base_currency
      and a.opening_balance<>0 and a.opening_reporting_amount is null) then raise exception 'finance_opening_fx_required'; end if;
  end if;
  return new;
end $$;
