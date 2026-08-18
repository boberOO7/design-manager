create table public.contractor_categories (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  color_key text not null check (color_key in ('blue', 'cyan', 'teal', 'green', 'lime', 'amber', 'orange', 'rose', 'pink', 'purple', 'violet', 'indigo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index contractor_categories_studio_name_key
  on public.contractor_categories (studio_id, lower(btrim(name)));

create trigger set_contractor_categories_updated_at
  before update on public.contractor_categories
  for each row execute function public.set_updated_at();

alter table public.contractors add column category_id uuid references public.contractor_categories(id) on delete restrict;

with contractor_studios as (
  select
    contractor.id,
    contractor.category,
    ownership.studio_id
  from public.contractors as contractor
  join lateral (
    select (array_agg(member.studio_id))[1] as studio_id
    from public.studio_members as member
    where member.user_id = contractor.created_by
      and member.joined_at <= contractor.created_at
      and (member.removed_at is null or member.removed_at > contractor.created_at)
    having count(*) = 1
  ) as ownership on true
), category_sources as (
  select distinct on (contractor_studios.studio_id, lower(btrim(contractor_studios.category)))
    contractor_studios.studio_id,
    btrim(contractor_studios.category) as name,
    lower(btrim(contractor_studios.category)) as normalized_name
  from contractor_studios
  order by contractor_studios.studio_id, lower(btrim(contractor_studios.category)), btrim(contractor_studios.category)
), ranked_categories as (
  select
    studio_id,
    name,
    (array['blue', 'cyan', 'teal', 'green', 'lime', 'amber', 'orange', 'rose', 'pink', 'purple', 'violet', 'indigo'])[
      ((row_number() over (partition by studio_id order by normalized_name) - 1) % 12) + 1
    ] as color_key
  from category_sources
)
insert into public.contractor_categories (studio_id, name, color_key)
select studio_id, name, color_key from ranked_categories;

with contractor_studios as (
  select
    contractor.id,
    contractor.category,
    ownership.studio_id
  from public.contractors as contractor
  join lateral (
    select (array_agg(member.studio_id))[1] as studio_id
    from public.studio_members as member
    where member.user_id = contractor.created_by
      and member.joined_at <= contractor.created_at
      and (member.removed_at is null or member.removed_at > contractor.created_at)
    having count(*) = 1
  ) as ownership on true
)
update public.contractors as contractor
set category_id = category.id
from contractor_studios as ownership
join public.contractor_categories as category
  on category.studio_id = ownership.studio_id
  and lower(btrim(category.name)) = lower(btrim(ownership.category))
where contractor.id = ownership.id;

alter table public.contractors alter column category_id set not null;
create index contractors_category_id_idx on public.contractors (category_id);
alter table public.contractors drop column category;

alter table public.contractor_categories enable row level security;

revoke all on table public.contractor_categories from anon;
revoke all on table public.contractor_categories from authenticated;
grant select on table public.contractor_categories to authenticated;

create policy "contractor_categories_select_for_active_studio_members"
on public.contractor_categories for select to authenticated
using (
  exists (
    select 1
    from public.studio_members as member
    where member.studio_id = contractor_categories.studio_id
      and member.user_id = (select auth.uid())
      and member.is_active
  )
);

create or replace function public.resolve_contractor_category(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio_id uuid;
  v_studio_ids uuid[];
  v_category_id uuid;
  v_color_key text;
  v_palette text[] := array['blue', 'cyan', 'teal', 'green', 'lime', 'amber', 'orange', 'rose', 'pink', 'purple', 'violet', 'indigo'];
begin
  select array_agg(studio_id order by joined_at asc) into v_studio_ids
  from public.studio_members
  where user_id = auth.uid() and is_active;

  if coalesce(cardinality(v_studio_ids), 0) <> 1 then
    raise exception 'Exactly one active studio membership is required';
  end if;

  v_studio_id := v_studio_ids[1];

  select id into v_category_id
  from public.contractor_categories
  where studio_id = v_studio_id and lower(btrim(name)) = lower(btrim(p_name));

  if v_category_id is not null then
    return v_category_id;
  end if;

  select palette.color_key into v_color_key
  from unnest(v_palette) with ordinality as palette(color_key, position)
  where not exists (
    select 1 from public.contractor_categories
    where studio_id = v_studio_id and color_key = palette.color_key
  )
  order by palette.position
  limit 1;

  if v_color_key is null then
    select v_palette[((count(*)::integer % array_length(v_palette, 1)) + 1)] into v_color_key
    from public.contractor_categories
    where studio_id = v_studio_id;
  end if;

  insert into public.contractor_categories (studio_id, name, color_key)
  values (v_studio_id, btrim(p_name), v_color_key)
  on conflict (studio_id, lower(btrim(name))) do update set name = contractor_categories.name
  returning id into v_category_id;

  return v_category_id;
end;
$$;

revoke all on function public.resolve_contractor_category(text) from public;
grant execute on function public.resolve_contractor_category(text) to authenticated;

revoke insert, update on table public.contractors from authenticated;
grant insert (category_id, name, website_url, phone, description, created_by)
on table public.contractors to authenticated;
grant update (category_id, name, website_url, phone, description)
on table public.contractors to authenticated;
