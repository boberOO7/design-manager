alter table public.contractor_categories drop constraint contractor_categories_color_key_check;

with ranked_categories as (
  select
    id,
    (array['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'bronze'])[
      ((row_number() over (partition by studio_id order by lower(btrim(name)), id) - 1) % 9) + 1
    ] as color_key
  from public.contractor_categories
)
update public.contractor_categories as category
set color_key = ranked_categories.color_key
from ranked_categories
where category.id = ranked_categories.id;

alter table public.contractor_categories add constraint contractor_categories_color_key_check
  check (color_key in ('red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'bronze'));

create or replace function public.resolve_contractor_category(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_studio_ids uuid[];
  v_studio_id uuid;
  v_category_id uuid;
  v_color_key text;
  v_palette text[] := array['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'bronze'];
begin
  select array_agg(studio_id order by joined_at asc) into v_studio_ids from public.studio_members where user_id = auth.uid() and is_active;
  if coalesce(cardinality(v_studio_ids), 0) <> 1 then raise exception 'Exactly one active studio membership is required'; end if;
  v_studio_id := v_studio_ids[1];
  select id into v_category_id from public.contractor_categories where studio_id = v_studio_id and lower(btrim(name)) = lower(btrim(p_name));
  if v_category_id is not null then return v_category_id; end if;
  select palette.color_key into v_color_key from unnest(v_palette) with ordinality as palette(color_key, position)
  where not exists (select 1 from public.contractor_categories where studio_id = v_studio_id and color_key = palette.color_key)
  order by palette.position limit 1;
  if v_color_key is null then select v_palette[((count(*)::integer % array_length(v_palette, 1)) + 1)] into v_color_key from public.contractor_categories where studio_id = v_studio_id; end if;
  insert into public.contractor_categories (studio_id, name, color_key) values (v_studio_id, btrim(p_name), v_color_key)
  on conflict (studio_id, lower(btrim(name))) do update set name = contractor_categories.name returning id into v_category_id;
  return v_category_id;
end;
$$;

create or replace function public.update_contractor_category_color(p_category_id uuid, p_color_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_studio_ids uuid[];
  v_roles text[];
  v_palette text[] := array['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'bronze'];
begin
  select array_agg(studio_id order by joined_at asc), array_agg(system_role order by joined_at asc) into v_studio_ids, v_roles from public.studio_members where user_id = auth.uid() and is_active;
  if coalesce(cardinality(v_studio_ids), 0) <> 1 or v_roles[1] <> 'admin' then raise exception 'Only an active studio administrator may update category colors'; end if;
  if not p_color_key = any(v_palette) then raise exception 'Unsupported contractor category color'; end if;
  update public.contractor_categories set color_key = p_color_key where id = p_category_id and studio_id = v_studio_ids[1];
  if not found then raise exception 'Contractor category was not found in the active studio'; end if;
end;
$$;

revoke all on function public.update_contractor_category_color(uuid, text) from public;
grant execute on function public.update_contractor_category_color(uuid, text) to authenticated;
