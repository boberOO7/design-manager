drop policy if exists "contractors_update_for_active_admins" on public.contractors;

create policy "contractors_update_for_active_studio_members"
on public.contractors for update to authenticated
using (
  exists (
    select 1
    from public.contractor_categories as category
    join public.studio_members as member on member.studio_id = category.studio_id
    where category.id = contractors.category_id
      and member.user_id = (select auth.uid())
      and member.is_active
  )
)
with check (
  exists (
    select 1
    from public.contractor_categories as category
    join public.studio_members as member on member.studio_id = category.studio_id
    where category.id = contractors.category_id
      and member.user_id = (select auth.uid())
      and member.is_active
  )
);

create function private.prevent_contractor_cross_studio_category_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is distinct from old.category_id
    and exists (
      select 1
      from public.contractor_categories as old_category
      join public.contractor_categories as new_category on new_category.id = new.category_id
      where old_category.id = old.category_id
        and old_category.studio_id <> new_category.studio_id
    ) then
    raise exception 'Contractors cannot be reassigned to a different studio';
  end if;

  return new;
end;
$$;

revoke execute on function private.prevent_contractor_cross_studio_category_change() from public, anon, authenticated;

create trigger prevent_contractor_cross_studio_category_change
before update of category_id on public.contractors
for each row execute function private.prevent_contractor_cross_studio_category_change();
