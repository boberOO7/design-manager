grant select on public.equipment_catalog_provider_products to authenticated;
create policy equipment_catalog_provider_admin_read on public.equipment_catalog_provider_products for select to authenticated
using ((select count(*) = 1 and bool_and(m.system_role = 'admin') from public.studio_members m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.user_id = (select auth.uid()) and m.is_active));
