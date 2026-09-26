-- Only posted cash and realized trip expenses fix the start of financial history.
-- Plans, commitments, and unpaid payroll do not.
create or replace function private.finance_has_substantive_history(p_studio_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.finance_movements where studio_id=p_studio_id)
    or exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id and kind='expense');
$$;

-- Track only reopened drafts, so first-time setup remains freely editable.
create table private.finance_reopen_origin (
  studio_id uuid primary key references public.finance_settings(studio_id) on delete cascade
);

create function private.track_finance_reopen_origin()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.finalized_at is not null and new.finalized_at is null then
    insert into private.finance_reopen_origin(studio_id) values(new.studio_id)
    on conflict do nothing;
  elsif old.finalized_at is null and new.finalized_at is not null then
    delete from private.finance_reopen_origin where studio_id=new.studio_id;
  end if;
  return new;
end;
$$;
revoke all on function private.track_finance_reopen_origin() from public,anon,authenticated,service_role;
create trigger track_finance_reopen_origin after update on public.finance_settings
for each row execute function private.track_finance_reopen_origin();

-- A non-zero opening belongs to the original cutover day. Clear it explicitly
-- before moving that day; keep reporting-currency locks independent of reopening.
create or replace function private.guard_finance_settings()
returns trigger language plpgsql set search_path='' as $$
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
  ) and not (
    new.base_currency is not distinct from old.base_currency
    and new.cutover_date is not distinct from old.cutover_date
    and new.finalized_at is null and new.finalized_by is null
    and not private.finance_has_substantive_history(old.studio_id)
  ) then raise exception 'finance_setup_finalized'; end if;

  if old.finalized_at is null and new.cutover_date is distinct from old.cutover_date
    and exists(select 1 from private.finance_reopen_origin where studio_id=old.studio_id)
    and exists(select 1 from public.finance_accounts where studio_id=old.studio_id and opening_balance<>0)
    then raise exception 'finance_opening_cutover_locked'; end if;
  if old.finalized_at is null and new.base_currency is distinct from old.base_currency
    and (private.finance_has_substantive_history(old.studio_id)
      or (exists(select 1 from private.finance_reopen_origin where studio_id=old.studio_id)
        and exists(select 1 from public.finance_accounts where studio_id=old.studio_id and opening_balance<>0))
      or exists(select 1 from public.finance_budget_revisions where studio_id=old.studio_id)
      or exists(select 1 from public.finance_forecast_snapshots where studio_id=old.studio_id)
      or exists(select 1 from public.finance_trip_entries where studio_id=old.studio_id))
    then raise exception 'finance_base_currency_locked'; end if;
  return new;
end;
$$;
