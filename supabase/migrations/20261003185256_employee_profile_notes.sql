create table public.employee_profile_notes (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete restrict,
  employee_id uuid not null,
  review_month date not null check (isfinite(review_month) and extract(day from review_month) = 1),
  note text not null check (length(btrim(note)) > 0),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (studio_id, employee_id)
    references public.studio_members(studio_id, user_id) on delete restrict,
  foreign key (studio_id, author_id)
    references public.studio_members(studio_id, user_id) on delete restrict
);

create index employee_profile_notes_employee_month_idx
  on public.employee_profile_notes (studio_id, employee_id, review_month desc, created_at desc);
create index employee_profile_notes_author_idx
  on public.employee_profile_notes (author_id);

alter table public.employee_profile_notes enable row level security;

revoke all on table public.employee_profile_notes from public, anon, authenticated;
grant select on table public.employee_profile_notes to authenticated;
grant insert (studio_id, employee_id, review_month, note)
  on table public.employee_profile_notes to authenticated;
grant all on table public.employee_profile_notes to service_role;

create policy employee_profile_notes_select_active_admin
  on public.employee_profile_notes
  for select
  to authenticated
  using (
    (select private.is_studio_admin(studio_id))
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.is_active
    )
  );

create policy employee_profile_notes_insert_active_admin
  on public.employee_profile_notes
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.is_studio_admin(studio_id))
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.is_active
    )
  );
