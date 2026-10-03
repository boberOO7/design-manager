-- Credited productivity area is confidential studio accounting data. The
-- application exposes derived totals only after an administrator check, and
-- this policy protects direct Data API reads as well.
drop policy "productivity_attributions_select_for_active_studio_members"
  on public.productivity_attributions;

create policy "productivity_attributions_select_for_active_studio_admins"
on public.productivity_attributions for select to authenticated
using ((select private.is_studio_admin(studio_id)));
