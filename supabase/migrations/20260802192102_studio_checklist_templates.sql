create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_templates_name_not_blank check (name = btrim(name))
);

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  weight numeric not null check (weight > 0 and weight <= 1000 and trunc(weight) = weight),
  position integer not null check (position >= 0 and position <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, position)
);

create index checklist_template_items_template_order
on public.checklist_template_items(template_id, position, id);

create unique index checklist_templates_studio_normalized_name_key
on public.checklist_templates(studio_id, lower(btrim(name)));

create trigger set_checklist_templates_updated_at
before update on public.checklist_templates
for each row execute function public.set_updated_at();

create trigger set_checklist_template_items_updated_at
before update on public.checklist_template_items
for each row execute function public.set_updated_at();

alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;

grant select on public.checklist_templates, public.checklist_template_items to authenticated;

create policy "checklist_templates_select_for_active_studio_members"
on public.checklist_templates for select to authenticated
using ((select private.is_studio_member(studio_id)));

create policy "checklist_template_items_select_for_active_studio_members"
on public.checklist_template_items for select to authenticated
using (exists (
  select 1 from public.checklist_templates as template
  where template.id = template_id
    and private.is_studio_member(template.studio_id)
));

create or replace function public.save_checklist_template(
  p_template_id uuid,
  p_studio_id uuid,
  p_name text,
  p_stages jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_template_id uuid;
  normalized_name text := btrim(p_name);
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then
    raise exception 'Only studio administrators can save checklist templates';
  end if;
  if char_length(normalized_name) not between 1 and 120 then
    raise exception 'Checklist template names must be between 1 and 120 characters';
  end if;
  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then
    raise exception 'A checklist template needs at least one stage';
  end if;

  if p_template_id is null then
    insert into public.checklist_templates (studio_id, name, created_by)
    values (p_studio_id, normalized_name, auth.uid())
    returning id into saved_template_id;
  else
    update public.checklist_templates
    set name = normalized_name
    where id = p_template_id
      and studio_id = p_studio_id
    returning id into saved_template_id;
    if saved_template_id is null then
      raise exception 'Checklist template was not found';
    end if;
    delete from public.checklist_template_items where template_id = saved_template_id;
  end if;

  insert into public.checklist_template_items (template_id, title, weight, position)
  select saved_template_id, btrim(item.title), item.weight, item.ordinality - 1
  from (
    select value ->> 'title' as title, (value ->> 'weight')::numeric as weight, ordinality
    from jsonb_array_elements(p_stages) with ordinality
  ) as item
  where char_length(btrim(item.title)) between 1 and 200
    and item.weight > 0 and item.weight <= 1000 and trunc(item.weight) = item.weight
  order by item.ordinality;

  if jsonb_array_length(p_stages) <> (select count(*) from public.checklist_template_items where template_id = saved_template_id) then
    raise exception 'Checklist stages must have a title and a whole-number weight from 1 to 1000';
  end if;
  return saved_template_id;
exception
  when unique_violation then
    raise exception 'A checklist template with this name already exists'
      using errcode = 'unique_violation';
end;
$$;

revoke execute on function public.save_checklist_template(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.save_checklist_template(uuid, uuid, text, jsonb) to authenticated;

create or replace function public.set_checklist_template_archived(
  p_template_id uuid,
  p_archived boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived_at_value timestamptz;
  target_studio_id uuid;
begin
  select studio_id into target_studio_id
  from public.checklist_templates
  where id = p_template_id;
  if target_studio_id is null then
    raise exception 'Checklist template was not found';
  end if;
  if not coalesce(private.is_studio_admin(target_studio_id), false) then
    raise exception 'Only studio administrators can archive checklist templates';
  end if;
  update public.checklist_templates
  set archived_at = case when p_archived then now() else null end
  where id = p_template_id
  returning archived_at into archived_at_value;
  return archived_at_value;
end;
$$;

revoke execute on function public.set_checklist_template_archived(uuid, boolean) from public, anon;
grant execute on function public.set_checklist_template_archived(uuid, boolean) to authenticated;

insert into public.checklist_templates (studio_id, name, created_by)
select studio.id, preset.name, admin_member.user_id
from public.studios as studio
join lateral (
  select member.user_id
  from public.studio_members as member
  where member.studio_id = studio.id
    and member.is_active
    and member.system_role = 'admin'
  order by member.joined_at, member.id
  limit 1
) as admin_member on true
cross join (values
  ('Interior design workflow'),
  ('Architectural workflow')
) as preset(name)
on conflict do nothing;

insert into public.checklist_template_items (template_id, title, weight, position)
select template.id, stage.title, stage.weight, stage.position
from public.checklist_templates as template
join lateral (values
  ('Interior design workflow', 'Planning and space planning', 2::numeric, 0),
  ('Interior design workflow', 'Design concept development', 3::numeric, 1),
  ('Interior design workflow', 'Materials and finishes selection', 2::numeric, 2),
  ('Interior design workflow', 'Furniture and equipment selection', 2::numeric, 3),
  ('Interior design workflow', '3D visualization', 4::numeric, 4),
  ('Interior design workflow', 'Working drawings', 4::numeric, 5),
  ('Interior design workflow', 'Specification preparation', 2::numeric, 6),
  ('Interior design workflow', 'Final review and presentation preparation', 1::numeric, 7),
  ('Architectural workflow', 'Site survey and source data review', 2::numeric, 0),
  ('Architectural workflow', 'Functional zoning and planning', 3::numeric, 1),
  ('Architectural workflow', 'Architectural concept development', 3::numeric, 2),
  ('Architectural workflow', 'Plans, elevations and sections', 4::numeric, 3),
  ('Architectural workflow', 'Structural and MEP coordination', 3::numeric, 4),
  ('Architectural workflow', 'Working documentation', 5::numeric, 5),
  ('Architectural workflow', 'Final drawing package review', 2::numeric, 6)
) as stage(template_name, title, weight, position) on stage.template_name = template.name
on conflict (template_id, position) do nothing;
