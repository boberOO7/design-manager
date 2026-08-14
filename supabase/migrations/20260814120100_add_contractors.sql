create table public.contractors (
  id uuid primary key default gen_random_uuid(),
  category text not null check (char_length(btrim(category)) between 1 and 100),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  phone text,
  description text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contractors_name_idx on public.contractors (name);
create index contractors_category_idx on public.contractors (category);

create trigger set_contractors_updated_at
  before update on public.contractors
  for each row execute function public.set_updated_at();

alter table public.contractors enable row level security;

grant select, insert, delete on table public.contractors to authenticated;
grant update (category, name, website_url, phone, description)
on table public.contractors to authenticated;

create policy "contractors_select_for_active_members"
on public.contractors for select to authenticated
using (
  exists (
    select 1 from public.studio_members as member
    where member.user_id = (select auth.uid())
      and member.is_active
  )
);

create policy "contractors_insert_for_active_members"
on public.contractors for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.studio_members as member
    where member.user_id = (select auth.uid())
      and member.is_active
  )
);

create policy "contractors_update_for_active_admins"
on public.contractors for update to authenticated
using (
  exists (
    select 1 from public.studio_members as member
    where member.user_id = (select auth.uid())
      and member.is_active
      and member.system_role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.studio_members as member
    where member.user_id = (select auth.uid())
      and member.is_active
      and member.system_role = 'admin'
  )
);

create policy "contractors_delete_for_active_admins"
on public.contractors for delete to authenticated
using (
  exists (
    select 1 from public.studio_members as member
    where member.user_id = (select auth.uid())
      and member.is_active
      and member.system_role = 'admin'
  )
);
