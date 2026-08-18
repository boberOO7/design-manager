create table public.contractor_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.contractor_categories(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (id, category_id)
);

create unique index contractor_subcategories_category_name_key
  on public.contractor_subcategories (category_id, lower(btrim(name)));

create index contractor_subcategories_category_id_idx
  on public.contractor_subcategories (category_id);

alter table public.contractors add column subcategory_id uuid;
alter table public.contractors add constraint contractors_subcategory_category_fkey
  foreign key (subcategory_id, category_id)
  references public.contractor_subcategories (id, category_id)
  on delete restrict;
create index contractors_subcategory_id_idx on public.contractors (subcategory_id);

alter table public.contractor_subcategories enable row level security;

revoke all on table public.contractor_subcategories from anon;
revoke all on table public.contractor_subcategories from authenticated;
grant select on table public.contractor_subcategories to authenticated;

create policy "contractor_subcategories_select_for_active_studio_members"
on public.contractor_subcategories for select to authenticated
using (
  exists (
    select 1
    from public.contractor_categories as category
    join public.studio_members as member on member.studio_id = category.studio_id
    where category.id = contractor_subcategories.category_id
      and member.user_id = (select auth.uid())
      and member.is_active
  )
);

create function public.resolve_contractor_subcategory(p_category_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio_ids uuid[];
  v_studio_id uuid;
  v_subcategory_id uuid;
begin
  select array_agg(studio_id order by joined_at asc)
  into v_studio_ids
  from public.studio_members
  where user_id = auth.uid() and is_active;

  if coalesce(cardinality(v_studio_ids), 0) <> 1 then
    raise exception 'Exactly one active studio membership is required';
  end if;

  v_studio_id := v_studio_ids[1];

  if not exists (
    select 1
    from public.contractor_categories
    where id = p_category_id and studio_id = v_studio_id
  ) then
    raise exception 'Contractor category was not found in the active studio';
  end if;

  select id into v_subcategory_id
  from public.contractor_subcategories
  where category_id = p_category_id
    and lower(btrim(name)) = lower(btrim(p_name));

  if v_subcategory_id is not null then
    return v_subcategory_id;
  end if;

  insert into public.contractor_subcategories (category_id, name)
  values (p_category_id, btrim(p_name))
  on conflict (category_id, lower(btrim(name))) do update
    set name = contractor_subcategories.name
  returning id into v_subcategory_id;

  return v_subcategory_id;
end;
$$;

revoke all on function public.resolve_contractor_subcategory(uuid, text) from public;
grant execute on function public.resolve_contractor_subcategory(uuid, text) to authenticated;

revoke insert, update on table public.contractors from authenticated;
grant insert (category_id, subcategory_id, name, website_url, phone, description, created_by)
on table public.contractors to authenticated;
grant update (category_id, subcategory_id, name, website_url, phone, description)
on table public.contractors to authenticated;
