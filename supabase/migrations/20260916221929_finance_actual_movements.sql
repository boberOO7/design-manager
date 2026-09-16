-- Immutable events and account effects are the only source of actual cash.
alter table public.finance_accounts add constraint finance_accounts_currency_key unique(studio_id,id,currency);
alter table public.finance_settings add constraint finance_settings_currency_key unique(studio_id,base_currency);
create table public.finance_movements (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  request_id uuid not null,
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  kind text not null check (kind in ('incoming','outgoing','transfer','owner_withdrawal','refund','reversal')),
  nature text not null check (nature in ('operating','financing','owner_distribution','transfer')),
  financial_date date not null,
  category text not null check (char_length(category) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  related_movement_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(studio_id, id), unique(studio_id, request_id),
  foreign key(studio_id, related_movement_id) references public.finance_movements(studio_id,id) on delete restrict,
  check ((kind in ('refund','reversal')) = (related_movement_id is not null)),
  check (kind <> 'transfer' or nature = 'transfer'),
  check (kind <> 'owner_withdrawal' or nature = 'owner_distribution'),
  check (kind not in ('incoming','outgoing') or nature in ('operating','financing'))
);
create unique index finance_one_reversal on public.finance_movements(studio_id, related_movement_id) where kind = 'reversal';
create index finance_movements_date_idx on public.finance_movements(studio_id, financial_date desc, created_at desc, id);
create index finance_movements_related_idx on public.finance_movements(studio_id, related_movement_id) where related_movement_id is not null;
create index finance_movements_creator_idx on public.finance_movements(created_by);

create table public.finance_movement_entries (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  movement_id uuid not null,
  account_id uuid not null,
  entry_role text not null check (entry_role in ('primary','destination','fee')),
  currency text not null references public.finance_currencies(code) on delete restrict,
  -- Signed exact account-currency amount. No typmod may silently round input.
  amount numeric not null check (amount <> 0 and amount between -9999999999.9999 and 9999999999.9999),
  reporting_currency text not null references public.finance_currencies(code) on delete restrict,
  reporting_amount numeric not null check (reporting_amount between -99999999999999999999 and 99999999999999999999),
  fx_rate numeric not null check (fx_rate > 0 and fx_rate <= 1000000000 and fx_rate = round(fx_rate,10)),
  fx_source text not null check (fx_source in ('identity','manual','nbu')),
  fx_effective_date date not null,
  unique(studio_id, movement_id, entry_role),
  foreign key(studio_id,movement_id) references public.finance_movements(studio_id,id) on delete restrict,
  foreign key(studio_id,account_id) references public.finance_accounts(studio_id,id) on delete restrict,
  foreign key(studio_id,account_id,currency) references public.finance_accounts(studio_id,id,currency) on delete restrict,
  foreign key(studio_id,reporting_currency) references public.finance_settings(studio_id,base_currency) on delete restrict,
  check ((currency = reporting_currency and fx_source = 'identity' and fx_rate = 1)
    or (currency <> reporting_currency and fx_source in ('manual','nbu'))),
  check (fx_source <> 'nbu' or reporting_currency = 'UAH')
);
create index finance_entries_account_idx on public.finance_movement_entries(studio_id,account_id);

alter table public.finance_movements enable row level security;
alter table public.finance_movement_entries enable row level security;
revoke all on public.finance_movements, public.finance_movement_entries from public,anon,authenticated,service_role;
grant select on public.finance_movements, public.finance_movement_entries to authenticated;
create policy finance_movements_admin_read on public.finance_movements for select to authenticated
using ((select private.is_finance_admin(studio_id)));
create policy finance_entries_admin_read on public.finance_movement_entries for select to authenticated
using ((select private.is_finance_admin(studio_id)));

create function private.reject_finance_history_change() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'finance_history_immutable'; end;
$$;
revoke all on function private.reject_finance_history_change() from public,anon,authenticated,service_role;
create trigger finance_movements_immutable before update or delete on public.finance_movements
for each row execute function private.reject_finance_history_change();
create trigger finance_entries_immutable before update or delete on public.finance_movement_entries
for each row execute function private.reject_finance_history_change();

-- Internal insert helper: rates are reporting units per ONE account currency unit.
create function private.add_finance_entry(
  p_studio uuid, p_movement uuid, p_account uuid, p_role text, p_amount numeric, p_fx jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare account public.finance_accounts; setup public.finance_settings; event public.finance_movements;
  digits integer; reporting_digits integer; rate numeric; source text; effective date;
begin
  select * into account from public.finance_accounts where studio_id=p_studio and id=p_account and archived_at is null;
  if not found then raise exception 'finance_account_unavailable'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio;
  select * into event from public.finance_movements where studio_id=p_studio and id=p_movement;
  select minor_units into digits from public.finance_currencies where code=account.currency;
  select minor_units into reporting_digits from public.finance_currencies where code=setup.base_currency;
  if p_amount is null or p_amount=0 or p_amount <> round(p_amount,digits) then raise exception 'finance_amount_invalid'; end if;
  if account.currency=setup.base_currency then
    rate:=1; source:='identity'; effective:=event.financial_date;
  else
    rate:=(p_fx->>'rate')::numeric; source:=p_fx->>'source'; effective:=(p_fx->>'effectiveDate')::date;
    if rate is null or source is null or effective is distinct from event.financial_date then raise exception 'finance_fx_required'; end if;
  end if;
  insert into public.finance_movement_entries(studio_id,movement_id,account_id,entry_role,currency,amount,
    reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date)
  values(p_studio,p_movement,p_account,p_role,account.currency,p_amount,setup.base_currency,
    round(p_amount*rate,reporting_digits),rate,source,effective);
end;
$$;
revoke all on function private.add_finance_entry(uuid,uuid,uuid,text,numeric,jsonb) from public,anon,authenticated,service_role;

create function public.record_finance_movement(p_studio_id uuid,p_request_id uuid,p_input jsonb)
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
    or day is null or day<setup.cutover_date or day>(now() at time zone 'Europe/Kyiv')::date
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

create function public.reverse_finance_movement(p_studio_id uuid,p_request_id uuid,p_movement_id uuid,p_date date,p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare setup public.finance_settings; original public.finance_movements; existing public.finance_movements;
  payload jsonb; reversal_id uuid;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id for update;
  if not found or setup.finalized_at is null then raise exception 'finance_finalized_setup_required'; end if;
  payload:=jsonb_build_object('kind','reversal','relatedMovementId',p_movement_id,'date',p_date,'reason',btrim(p_reason));
  select * into existing from public.finance_movements where studio_id=p_studio_id and request_id=p_request_id;
  if found then
    if existing.request_payload is distinct from payload then raise exception 'finance_request_conflict'; end if;
    return existing.id;
  end if;
  select * into original from public.finance_movements where studio_id=p_studio_id and id=p_movement_id;
  if not found or original.kind='reversal' then raise exception 'finance_reversal_unavailable'; end if;
  if p_request_id is null or p_date is null or p_date<original.financial_date or p_date>(now() at time zone 'Europe/Kyiv')::date
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'finance_input_invalid'; end if;
  if exists(select 1 from public.finance_movements where studio_id=p_studio_id and kind='reversal' and related_movement_id=original.id)
    then raise exception 'finance_already_reversed'; end if;
  if exists(select 1 from public.finance_movements f where f.studio_id=p_studio_id and f.kind='refund' and f.related_movement_id=original.id
    and not exists(select 1 from public.finance_movements r where r.studio_id=p_studio_id and r.kind='reversal' and r.related_movement_id=f.id))
    then raise exception 'finance_reverse_refunds_first'; end if;
  insert into public.finance_movements(studio_id,request_id,request_payload,kind,nature,financial_date,category,description,related_movement_id,created_by)
  values(p_studio_id,p_request_id,payload,'reversal',original.nature,p_date,original.category,btrim(p_reason),original.id,auth.uid()) returning id into reversal_id;
  -- Reversals cancel the original valuation, even for archived accounts. Never fetch fresh FX.
  insert into public.finance_movement_entries(studio_id,movement_id,account_id,entry_role,currency,amount,
    reporting_currency,reporting_amount,fx_rate,fx_source,fx_effective_date)
  select studio_id,reversal_id,account_id,entry_role,currency,-amount,reporting_currency,-reporting_amount,fx_rate,fx_source,fx_effective_date
  from public.finance_movement_entries where studio_id=p_studio_id and movement_id=original.id;
  return reversal_id;
end;
$$;
revoke all on function public.record_finance_movement(uuid,uuid,jsonb),public.reverse_finance_movement(uuid,uuid,uuid,date,text)
from public,anon,authenticated,service_role;
grant execute on function public.record_finance_movement(uuid,uuid,jsonb),public.reverse_finance_movement(uuid,uuid,uuid,date,text) to authenticated;

-- Exact derived balances include archived accounts and exclude no historical rows.
create view public.finance_account_balances with (security_invoker=true) as
select a.id,a.studio_id,a.name,a.currency,a.archived_at,a.opening_balance,
  a.opening_balance+coalesce(sum(e.amount),0) as recorded_balance
from public.finance_accounts a left join public.finance_movement_entries e on e.studio_id=a.studio_id and e.account_id=a.id
group by a.id;
-- Reporting semantics, not a second ledger. Opening balances never enter this view.
create view public.finance_cash_effects with (security_invoker=true) as
select e.*,m.financial_date,m.kind,m.related_movement_id,
  case when e.entry_role='fee' then 'operating' else m.nature end as nature,
  case when e.entry_role='fee' then 'transfer_fee' else m.category end as category
from public.finance_movement_entries e join public.finance_movements m on m.studio_id=e.studio_id and m.id=e.movement_id;
revoke all on public.finance_account_balances,public.finance_cash_effects from public,anon,authenticated,service_role;
grant select on public.finance_account_balances,public.finance_cash_effects to authenticated;
