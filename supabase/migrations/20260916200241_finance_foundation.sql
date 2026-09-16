-- Finance is isolated from operational budgets, reminders, and service costs.
create function private.is_finance_admin(target_studio_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.studio_members member
    join public.profiles profile on profile.id = member.user_id
    where member.studio_id = target_studio_id
      and member.user_id = (select auth.uid())
      and member.system_role = 'admin' and member.is_active and profile.is_active
  ) and (
    select count(*) = 1 from public.studio_members member
    where member.user_id = (select auth.uid()) and member.is_active
  );
$$;
revoke all on function private.is_finance_admin(uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_finance_admin(uuid) to authenticated;

-- Reference data, extended by migrations; never take currency precision from a form.
create table public.finance_currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  minor_units integer not null check (minor_units between 0 and 4)
);

create table public.finance_settings (
  studio_id uuid primary key references public.studios(id) on delete restrict,
  base_currency text not null references public.finance_currencies(code) on delete restrict,
  cutover_date date not null check (cutover_date between date '1900-01-01' and date '9999-12-31'),
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_settings_finalization_check check ((finalized_at is null) = (finalized_by is null))
);

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.finance_settings(studio_id) on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  currency text not null references public.finance_currencies(code) on delete restrict,
  -- A starting stock of cash at the beginning of cutover day, never income/expense.
  -- No numeric typmod: reject excess precision instead of silently rounding it.
  opening_balance numeric not null default 0
    check (opening_balance between -9999999999.9999 and 9999999999.9999),
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, id)
);
create index finance_accounts_studio_archive_idx on public.finance_accounts(studio_id, archived_at);

alter table public.finance_currencies enable row level security;
alter table public.finance_settings enable row level security;
alter table public.finance_accounts enable row level security;
revoke all on table public.finance_currencies, public.finance_settings, public.finance_accounts
  from public, anon, authenticated, service_role;
grant select on table public.finance_currencies, public.finance_settings, public.finance_accounts to authenticated;

create policy finance_settings_select_admin on public.finance_settings for select to authenticated
using ((select private.is_finance_admin(studio_id)));
create policy finance_accounts_select_admin on public.finance_accounts for select to authenticated
using ((select private.is_finance_admin(studio_id)));
create policy finance_currencies_select_admin on public.finance_currencies for select to authenticated
using (exists (
  select 1 from public.studio_members member
  where member.user_id = (select auth.uid()) and private.is_finance_admin(member.studio_id)
));

create function private.guard_finance_settings()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.studio_id is distinct from old.studio_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'finance_identity_immutable';
  end if;
  if old.finalized_at is not null and (
    new.base_currency is distinct from old.base_currency
    or new.cutover_date is distinct from old.cutover_date
    or new.finalized_at is distinct from old.finalized_at
    or new.finalized_by is distinct from old.finalized_by
  ) then raise exception 'finance_setup_finalized'; end if;
  return new;
end;
$$;
revoke all on function private.guard_finance_settings() from public, anon, authenticated, service_role;
create trigger guard_finance_settings before update on public.finance_settings
for each row execute function private.guard_finance_settings();
create trigger set_finance_settings_updated_at before update on public.finance_settings
for each row execute function public.set_updated_at();

create function private.guard_finance_account()
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
      new.currency is distinct from old.currency or new.opening_balance is distinct from old.opening_balance
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
revoke all on function private.guard_finance_account() from public, anon, authenticated, service_role;
create trigger guard_finance_account before insert or update on public.finance_accounts
for each row execute function private.guard_finance_account();
create trigger set_finance_accounts_updated_at before update on public.finance_accounts
for each row execute function public.set_updated_at();

create function public.save_finance_settings(p_studio_id uuid, p_base_currency text, p_cutover_date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  insert into public.finance_settings(studio_id, base_currency, cutover_date, created_by)
  values (p_studio_id, p_base_currency, p_cutover_date, auth.uid())
  on conflict (studio_id) do update
    set base_currency = excluded.base_currency, cutover_date = excluded.cutover_date;
end;
$$;

create function public.finalize_finance_setup(p_studio_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare setup public.finance_settings;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into setup from public.finance_settings where studio_id = p_studio_id for update;
  if not found then raise exception 'finance_setup_required'; end if;
  if setup.finalized_at is not null then return; end if;
  if not exists (select 1 from public.finance_accounts where studio_id = p_studio_id and archived_at is null) then
    raise exception 'finance_active_account_required';
  end if;
  update public.finance_settings set finalized_at = now(), finalized_by = auth.uid() where studio_id = p_studio_id;
end;
$$;

create function public.save_finance_account(
  p_studio_id uuid, p_name text, p_currency text, p_opening_balance numeric, p_account_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare account_id uuid;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  perform 1 from public.finance_settings where studio_id = p_studio_id for update;
  if not found then raise exception 'finance_setup_required'; end if;
  if p_account_id is null then
    insert into public.finance_accounts(studio_id, name, currency, opening_balance, created_by)
    values (p_studio_id, btrim(p_name), p_currency, p_opening_balance, auth.uid()) returning id into account_id;
  else
    update public.finance_accounts set name = btrim(p_name), currency = p_currency, opening_balance = p_opening_balance
    where id = p_account_id and studio_id = p_studio_id and archived_at is null returning id into account_id;
    if not found then raise exception 'finance_account_unavailable'; end if;
  end if;
  return account_id;
end;
$$;

create function public.set_finance_account_archived(p_studio_id uuid, p_account_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  if p_archived is null then raise exception 'finance_archive_state_required'; end if;
  perform 1 from public.finance_settings where studio_id = p_studio_id for update;
  update public.finance_accounts set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_account_id and studio_id = p_studio_id;
  if not found then raise exception 'finance_account_unavailable'; end if;
end;
$$;

revoke all on function public.save_finance_settings(uuid, text, date), public.finalize_finance_setup(uuid),
  public.save_finance_account(uuid, text, text, numeric, uuid), public.set_finance_account_archived(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.save_finance_settings(uuid, text, date), public.finalize_finance_setup(uuid),
  public.save_finance_account(uuid, text, text, numeric, uuid), public.set_finance_account_archived(uuid, uuid, boolean)
  to authenticated;

-- ISO 4217 List One, SIX maintenance agency, published 2026-01-01.
-- https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
-- Entries without a monetary minor unit (e.g. precious metals/test codes) are excluded.
insert into public.finance_currencies(code, minor_units) values
  ('AED', 2),
  ('AFN', 2),
  ('ALL', 2),
  ('AMD', 2),
  ('AOA', 2),
  ('ARS', 2),
  ('AUD', 2),
  ('AWG', 2),
  ('AZN', 2),
  ('BAM', 2),
  ('BBD', 2),
  ('BDT', 2),
  ('BHD', 3),
  ('BIF', 0),
  ('BMD', 2),
  ('BND', 2),
  ('BOB', 2),
  ('BOV', 2),
  ('BRL', 2),
  ('BSD', 2),
  ('BTN', 2),
  ('BWP', 2),
  ('BYN', 2),
  ('BZD', 2),
  ('CAD', 2),
  ('CDF', 2),
  ('CHE', 2),
  ('CHF', 2),
  ('CHW', 2),
  ('CLF', 4),
  ('CLP', 0),
  ('CNY', 2),
  ('COP', 2),
  ('COU', 2),
  ('CRC', 2),
  ('CUP', 2),
  ('CVE', 2),
  ('CZK', 2),
  ('DJF', 0),
  ('DKK', 2),
  ('DOP', 2),
  ('DZD', 2),
  ('EGP', 2),
  ('ERN', 2),
  ('ETB', 2),
  ('EUR', 2),
  ('FJD', 2),
  ('FKP', 2),
  ('GBP', 2),
  ('GEL', 2),
  ('GHS', 2),
  ('GIP', 2),
  ('GMD', 2),
  ('GNF', 0),
  ('GTQ', 2),
  ('GYD', 2),
  ('HKD', 2),
  ('HNL', 2),
  ('HTG', 2),
  ('HUF', 2),
  ('IDR', 2),
  ('ILS', 2),
  ('INR', 2),
  ('IQD', 3),
  ('IRR', 2),
  ('ISK', 0),
  ('JMD', 2),
  ('JOD', 3),
  ('JPY', 0),
  ('KES', 2),
  ('KGS', 2),
  ('KHR', 2),
  ('KMF', 0),
  ('KPW', 2),
  ('KRW', 0),
  ('KWD', 3),
  ('KYD', 2),
  ('KZT', 2),
  ('LAK', 2),
  ('LBP', 2),
  ('LKR', 2),
  ('LRD', 2),
  ('LSL', 2),
  ('LYD', 3),
  ('MAD', 2),
  ('MDL', 2),
  ('MGA', 2),
  ('MKD', 2),
  ('MMK', 2),
  ('MNT', 2),
  ('MOP', 2),
  ('MRU', 2),
  ('MUR', 2),
  ('MVR', 2),
  ('MWK', 2),
  ('MXN', 2),
  ('MXV', 2),
  ('MYR', 2),
  ('MZN', 2),
  ('NAD', 2),
  ('NGN', 2),
  ('NIO', 2),
  ('NOK', 2),
  ('NPR', 2),
  ('NZD', 2),
  ('OMR', 3),
  ('PAB', 2),
  ('PEN', 2),
  ('PGK', 2),
  ('PHP', 2),
  ('PKR', 2),
  ('PLN', 2),
  ('PYG', 0),
  ('QAR', 2),
  ('RON', 2),
  ('RSD', 2),
  ('RUB', 2),
  ('RWF', 0),
  ('SAR', 2),
  ('SBD', 2),
  ('SCR', 2),
  ('SDG', 2),
  ('SEK', 2),
  ('SGD', 2),
  ('SHP', 2),
  ('SLE', 2),
  ('SOS', 2),
  ('SRD', 2),
  ('SSP', 2),
  ('STN', 2),
  ('SVC', 2),
  ('SYP', 2),
  ('SZL', 2),
  ('THB', 2),
  ('TJS', 2),
  ('TMT', 2),
  ('TND', 3),
  ('TOP', 2),
  ('TRY', 2),
  ('TTD', 2),
  ('TWD', 2),
  ('TZS', 2),
  ('UAH', 2),
  ('UGX', 0),
  ('USD', 2),
  ('USN', 2),
  ('UYI', 0),
  ('UYU', 2),
  ('UYW', 4),
  ('UZS', 2),
  ('VED', 2),
  ('VES', 2),
  ('VND', 0),
  ('VUV', 0),
  ('WST', 2),
  ('XAD', 2),
  ('XAF', 0),
  ('XCD', 2),
  ('XCG', 2),
  ('XOF', 0),
  ('XPF', 0),
  ('YER', 2),
  ('ZAR', 2),
  ('ZMW', 2),
  ('ZWG', 2);
