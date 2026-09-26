-- Accounts, their cutover opening stock, categories and schedule configuration
-- are setup. Posted cash and persisted financial results are history.
create function private.finance_has_substantive_history(p_studio_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.finance_movements where studio_id=p_studio_id)
    or exists(select 1 from public.finance_expected_items where studio_id=p_studio_id)
    or exists(select 1 from public.finance_obligations where studio_id=p_studio_id)
    or exists(select 1 from public.finance_trip_entries where studio_id=p_studio_id)
    or exists(select 1 from public.finance_project_terms where studio_id=p_studio_id)
    or exists(select 1 from public.finance_budget_revisions where studio_id=p_studio_id)
    or exists(select 1 from public.finance_forecast_snapshots where studio_id=p_studio_id)
    or exists(select 1 from public.finance_payroll_cost_revisions where studio_id=p_studio_id);
$$;
revoke all on function private.finance_has_substantive_history(uuid) from public,anon,authenticated,service_role;

-- Preserve the existing lock for all changes except a history-free transition
-- back to draft. The RPC below owns the valuation reset in that transition.
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
  return new;
end;
$$;

create function public.can_reopen_finance_setup(p_studio_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  return exists(select 1 from public.finance_settings where studio_id=p_studio_id and finalized_at is not null)
    and not private.finance_has_substantive_history(p_studio_id);
end;
$$;

create function public.reopen_finance_setup(p_studio_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare setup public.finance_settings;
begin
  if not private.is_finance_admin(p_studio_id) then raise exception 'finance_admin_required'; end if;
  select * into setup from public.finance_settings where studio_id=p_studio_id for update;
  if not found then raise exception 'finance_setup_required'; end if;
  if setup.finalized_at is null then return; end if;
  if private.finance_has_substantive_history(p_studio_id) then raise exception 'finance_reopen_history_exists'; end if;

  update public.finance_settings set finalized_at=null,finalized_by=null where studio_id=p_studio_id;
  -- The account stock survives. Its old reporting valuation must be re-entered
  -- if the admin changes the start date or reporting currency.
  update public.finance_accounts set opening_reporting_amount=null,opening_fx_rate=null,
    opening_fx_source=null,opening_fx_effective_date=null,opening_valued_at=null,opening_valued_by=null
  where studio_id=p_studio_id and opening_reporting_amount is not null;
end;
$$;
revoke all on function public.can_reopen_finance_setup(uuid),public.reopen_finance_setup(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.can_reopen_finance_setup(uuid),public.reopen_finance_setup(uuid) to authenticated;
