create type public.contractor_cooperation_status as enum ('verified', 'prospective');

alter table public.contractors
  add column cooperation_status public.contractor_cooperation_status not null default 'verified',
  add column is_recommended boolean not null default false,
  add constraint contractors_recommendation_requires_verified
    check (not is_recommended or cooperation_status = 'verified');

grant insert (cooperation_status, is_recommended), update (cooperation_status, is_recommended)
on public.contractors to authenticated;

drop policy "contractors_select_for_active_members" on public.contractors;
create policy "contractors_select_for_active_members"
on public.contractors for select to authenticated
using (
  exists (
    select 1
    from public.contractor_categories category
    join public.studio_members member on member.studio_id = category.studio_id
    join public.profiles profile on profile.id = member.user_id
    where category.id = contractors.category_id
      and member.user_id = (select auth.uid())
      and member.is_active and profile.is_active
      and (contractors.cooperation_status = 'verified' or member.system_role = 'admin')
  )
);

drop policy "contractors_insert_for_active_members" on public.contractors;
create policy "contractors_insert_for_active_members"
on public.contractors for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.contractor_categories category
    join public.studio_members member on member.studio_id = category.studio_id
    join public.profiles profile on profile.id = member.user_id
    where category.id = contractors.category_id
      and member.user_id = (select auth.uid())
      and member.is_active and profile.is_active
      and (contractors.cooperation_status = 'verified' or member.system_role = 'admin')
  )
);

drop policy "contractors_update_for_active_studio_members" on public.contractors;
create policy "contractors_update_for_active_studio_members"
on public.contractors for update to authenticated
using (
  exists (
    select 1
    from public.contractor_categories category
    join public.studio_members member on member.studio_id = category.studio_id
    join public.profiles profile on profile.id = member.user_id
    where category.id = contractors.category_id
      and member.user_id = (select auth.uid())
      and member.is_active and profile.is_active
      and (contractors.cooperation_status = 'verified' or member.system_role = 'admin')
  )
)
with check (
  exists (
    select 1
    from public.contractor_categories category
    join public.studio_members member on member.studio_id = category.studio_id
    join public.profiles profile on profile.id = member.user_id
    where category.id = contractors.category_id
      and member.user_id = (select auth.uid())
      and member.is_active and profile.is_active
      and (contractors.cooperation_status = 'verified' or member.system_role = 'admin')
  )
);

drop policy "contractors_delete_for_active_admins" on public.contractors;
create policy "contractors_delete_for_active_admins"
on public.contractors for delete to authenticated
using (
  exists (
    select 1
    from public.contractor_categories category
    join public.studio_members member on member.studio_id = category.studio_id
    join public.profiles profile on profile.id = member.user_id
    where category.id = contractors.category_id
      and member.user_id = (select auth.uid())
      and member.is_active and profile.is_active and member.system_role = 'admin'
  )
);

-- Ordinary fields remain editable by members; these two fields require an admin
-- even for direct Data API writes. The trigger also keeps demotion atomic.
create function private.enforce_contractor_cooperation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sensitive_change boolean;
begin
  if tg_op = 'INSERT' then
    sensitive_change := new.cooperation_status <> 'verified' or new.is_recommended;
  else
    sensitive_change := new.cooperation_status is distinct from old.cooperation_status
      or new.is_recommended is distinct from old.is_recommended;
  end if;

  if sensitive_change and not exists (
    select 1
    from public.contractor_categories category
    join public.studio_members member on member.studio_id = category.studio_id
    join public.profiles profile on profile.id = member.user_id
    where category.id = new.category_id
      and member.user_id = (select auth.uid())
      and member.is_active and profile.is_active and member.system_role = 'admin'
  ) then
    raise exception 'contractor_cooperation_admin_required' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.cooperation_status = 'prospective'
    and new.cooperation_status is distinct from old.cooperation_status then
    new.is_recommended := false;
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_contractor_cooperation() from public, anon, authenticated;
create trigger enforce_contractor_cooperation
before insert or update on public.contractors
for each row execute function private.enforce_contractor_cooperation();

notify pgrst, 'reload schema';
