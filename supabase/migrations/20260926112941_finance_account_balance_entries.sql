-- Dated account openings and reconciliations are ledger stock changes, not income/expense.
alter table public.finance_movements drop constraint finance_movements_kind_check;
alter table public.finance_movements add constraint finance_movements_kind_check
  check (kind in ('incoming','outgoing','transfer','owner_withdrawal','refund','reversal','account_opening','balance_adjustment'));
alter table public.finance_movements drop constraint finance_movements_nature_check;
alter table public.finance_movements add constraint finance_movements_nature_check
  check (nature in ('operating','financing','owner_distribution','transfer','balance'));
alter table public.finance_movements add constraint finance_balance_kind_nature_check
  check ((kind not in ('account_opening','balance_adjustment') or nature='balance')
    and (nature<>'balance' or kind in ('account_opening','balance_adjustment','reversal')));

create or replace function private.classify_finance_movement() returns trigger
language plpgsql security definer set search_path='' as $$
declare category public.finance_categories; original public.finance_movements;
begin
  if new.kind in ('refund','reversal') then
    select * into original from public.finance_movements where studio_id=new.studio_id and id=new.related_movement_id;
    new.category_id:=original.category_id; new.category:=original.category; new.nature:=original.nature;
  elsif new.kind in ('account_opening','balance_adjustment') then
    new.category_id:=null;
    new.category:=case new.kind when 'account_opening' then 'Account opening' else 'Balance adjustment' end;
    new.nature:='balance';
  elsif new.kind<>'transfer' then
    select * into category from public.finance_categories where studio_id=new.studio_id
      and id=(new.request_payload->>'categoryId')::uuid and archived_at is null;
    if not found or category.direction<>(case when new.kind='incoming' then 'incoming' else 'outgoing' end)
      or (new.kind='owner_withdrawal')<>(category.nature='owner_distribution') then raise exception 'finance_category_invalid'; end if;
    new.category_id:=category.id; new.category:=category.name; new.nature:=category.nature;
  end if;
  return new;
end $$;

create or replace view public.finance_account_balances with (security_invoker=true) as
select a.id,a.studio_id,a.name,a.currency,a.archived_at,a.opening_balance,
  a.opening_balance+coalesce(sum(e.amount),0) as recorded_balance,
  count(e.id) as ledger_entry_count
from public.finance_accounts a left join public.finance_movement_entries e on e.studio_id=a.studio_id and e.account_id=a.id
group by a.id;
revoke all on public.finance_account_balances from public,anon,authenticated,service_role;
grant select on public.finance_account_balances to authenticated;

-- Balance stock changes remain in finance_cash_effects for dated cash-balance history.
-- They never enter category actuals, P&L, Cash Flow income/expense or forecast actuals.
create or replace view public.finance_planning_actuals with(security_invoker=true) as
select e.studio_id,e.financial_date,e.nature,
  case when e.entry_role='fee' then null else m.category_id end as category_id,
  case when e.entry_role='fee' then 'outgoing' else coalesce(c.direction,
    case when coalesce(original.kind,m.kind)='incoming' then 'incoming' else 'outgoing' end) end as direction,
  e.reporting_amount * case when e.entry_role='fee' then -1 when coalesce(c.direction,
    case when coalesce(original.kind,m.kind)='incoming' then 'incoming' else 'outgoing' end)='incoming' then 1 else -1 end as amount,m.created_at as recorded_at,m.posting_order
from public.finance_cash_effects e
join public.finance_movements m on m.studio_id=e.studio_id and m.id=e.movement_id
left join public.finance_categories c on c.studio_id=m.studio_id and c.id=m.category_id
left join public.finance_movements related on related.studio_id=m.studio_id and related.id=m.related_movement_id
left join public.finance_movements original on original.studio_id=m.studio_id and original.id=case when related.kind='refund' then related.related_movement_id else related.id end
where e.nature not in ('transfer','balance');
revoke all on public.finance_planning_actuals from public,anon,authenticated,service_role;
grant select on public.finance_planning_actuals to authenticated;

create function private.post_finance_account_balance(
  p_studio_id uuid,p_request_id uuid,p_account_id uuid,p_kind text,p_date date,p_amount numeric,p_note text,p_fx jsonb,p_submission jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; payload jsonb;
begin
  if p_kind not in ('account_opening','balance_adjustment')
    or p_note is null or char_length(btrim(p_note))>2000 then raise exception 'finance_input_invalid'; end if;
  payload:=jsonb_build_object('kind',p_kind,'accountId',p_account_id,'date',p_date,
    'amount',p_amount,'note',btrim(p_note),'fx',p_fx,'input',p_submission,'submission',p_submission->'submission');
  insert into public.finance_movements(studio_id,request_id,request_payload,kind,nature,financial_date,category,description,created_by)
  values(p_studio_id,p_request_id,payload,p_kind,'balance',p_date,'Balance adjustment',btrim(p_note),auth.uid())
  returning id into result;
  perform private.add_finance_entry(p_studio_id,result,p_account_id,'primary',p_amount,p_fx);
  return result;
end $$;
revoke all on function private.post_finance_account_balance(uuid,uuid,uuid,text,date,numeric,text,jsonb,jsonb)
  from public,anon,authenticated,service_role;

-- Finalized setups use a single transaction for account creation and its dated opening.
create function public.create_finance_account_with_opening(p_studio_id uuid,p_request_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; payload jsonb; result uuid; amount numeric; day date; account_name text; account_currency text;
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
  amount:=(p_input->>'openingBalance')::numeric;
  day:=(p_input->>'date')::date;
  if account_name is null or char_length(account_name) not between 1 and 120
    or account_currency is null or amount is null or amount <> round(amount,4)
    or amount not between -9999999999.9999 and 9999999999.9999
    or day is null or day<setup.cutover_date or day>(now() at time zone 'Europe/Kyiv')::date
    then raise exception 'finance_input_invalid'; end if;
  insert into public.finance_accounts(studio_id,name,currency,opening_balance,created_by)
  values(p_studio_id,account_name,account_currency,0,auth.uid()) returning id into result;
  if amount<>0 then
    perform private.post_finance_account_balance(p_studio_id,p_request_id,result,'account_opening',day,amount,'',p_input->'fx',p_input);
  end if;
  insert into public.finance_planning_requests values(p_studio_id,p_request_id,payload,result,auth.uid(),now());
  return result;
end $$;
revoke all on function public.create_finance_account_with_opening(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.create_finance_account_with_opening(uuid,uuid,jsonb) to authenticated;

-- Only untouched zero-opening accounts can receive a late opening. Reconciliation
-- computes its delta under the studio lock, so concurrent postings cannot race it.
create function public.record_finance_account_balance(p_studio_id uuid,p_request_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings; existing public.finance_movements; account public.finance_accounts;
  result uuid; v_account_id uuid; kind text; day date; amount numeric; book numeric; note text;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id for update;
  if setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  if p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'finance_input_invalid'; end if;
  select * into existing from public.finance_movements where studio_id=p_studio_id and request_id=p_request_id;
  if found then
    if existing.request_payload->'input' is distinct from p_input then raise exception 'finance_request_conflict'; end if;
    return existing.id;
  end if;
  kind:=p_input->>'kind'; v_account_id:=(p_input->>'accountId')::uuid;
  day:=(p_input->>'date')::date; amount:=(p_input->>'amount')::numeric;
  note:=coalesce(p_input->>'note','');
  if kind not in ('account_opening','balance_adjustment')
    or day is null or day<setup.cutover_date or day>(now() at time zone 'Europe/Kyiv')::date
    or amount is null or amount<>round(amount,4) or amount not between -9999999999.9999 and 9999999999.9999
    or char_length(btrim(note))>2000 then raise exception 'finance_input_invalid'; end if;
  select * into account from public.finance_accounts where studio_id=p_studio_id and id=v_account_id and archived_at is null;
  if not found then raise exception 'finance_account_unavailable'; end if;
  select recorded_balance into book from public.finance_account_balances where studio_id=p_studio_id and id=v_account_id;
  if kind='account_opening' then
    if account.opening_balance<>0 or exists(select 1 from public.finance_movement_entries entry where entry.studio_id=p_studio_id and entry.account_id=v_account_id)
      then raise exception 'finance_opening_unavailable'; end if;
  else
    amount:=amount-book;
    if amount=0 then raise exception 'finance_no_balance_difference'; end if;
  end if;
  -- The full submission is retained for safe lost-response retries even though
  -- the event amount is the computed delta for adjustments.
  result:=private.post_finance_account_balance(p_studio_id,p_request_id,v_account_id,kind,day,amount,note,p_input->'fx',p_input);
  return result;
end $$;
revoke all on function public.record_finance_account_balance(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_finance_account_balance(uuid,uuid,jsonb) to authenticated;
