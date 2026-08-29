create table public.studio_days_off (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  date date not null,
  name text not null check (length(trim(name)) between 1 and 160),
  note text check (note is null or length(note) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (studio_id, date)
);

alter table public.studio_days_off enable row level security;

create policy studio_days_off_select_active_members
on public.studio_days_off for select to authenticated
using ((select private.is_studio_member(studio_id)));

create policy studio_days_off_insert_active_admins
on public.studio_days_off for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.is_studio_admin(studio_id))
);

create policy studio_days_off_update_active_admins
on public.studio_days_off for update to authenticated
using ((select private.is_studio_admin(studio_id)))
with check (
  (select private.is_studio_admin(studio_id))
);

create policy studio_days_off_delete_active_admins
on public.studio_days_off for delete to authenticated
using ((select private.is_studio_admin(studio_id)));

revoke all on table public.studio_days_off from anon, authenticated;
grant select on table public.studio_days_off to authenticated;
grant insert (studio_id, date, name, note, created_by) on table public.studio_days_off to authenticated;
grant update (date, name, note) on table public.studio_days_off to authenticated;
grant delete on table public.studio_days_off to authenticated;
