create table public.office_floor_plan_placements (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  workstation_id uuid,
  equipment_id uuid,
  floor smallint not null check (floor in (1, 2)),
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  display_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(display_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, id),
  foreign key (studio_id, workstation_id)
    references public.workstations(studio_id, id) on delete cascade,
  foreign key (studio_id, equipment_id)
    references public.equipment(studio_id, id) on delete cascade,
  constraint office_floor_plan_placements_one_entity check (
    num_nonnulls(workstation_id, equipment_id) = 1
  )
);

create unique index office_floor_plan_placements_workstation_idx
  on public.office_floor_plan_placements(studio_id, workstation_id)
  where workstation_id is not null;
create unique index office_floor_plan_placements_equipment_idx
  on public.office_floor_plan_placements(studio_id, equipment_id)
  where equipment_id is not null;

create trigger set_office_floor_plan_placements_updated_at
  before update on public.office_floor_plan_placements
  for each row execute function public.set_updated_at();

alter table public.office_floor_plan_placements enable row level security;

revoke all on table public.office_floor_plan_placements from public, anon, authenticated;
grant select on table public.office_floor_plan_placements to authenticated;
grant select, insert, update, delete on table public.office_floor_plan_placements to service_role;

create policy office_floor_plan_placements_select_admin
on public.office_floor_plan_placements for select to authenticated
using ((select private.is_studio_admin(studio_id)));

create policy office_floor_plan_placements_insert_admin
on public.office_floor_plan_placements for insert to authenticated
with check ((select private.is_studio_admin(studio_id)));

create policy office_floor_plan_placements_update_admin
on public.office_floor_plan_placements for update to authenticated
using ((select private.is_studio_admin(studio_id)))
with check ((select private.is_studio_admin(studio_id)));

create policy office_floor_plan_placements_delete_admin
on public.office_floor_plan_placements for delete to authenticated
using ((select private.is_studio_admin(studio_id)));

create function public.save_office_floor_plan_layout(
  p_studio_id uuid,
  p_placements jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_count integer;
begin
  if not private.is_studio_admin(p_studio_id) then
    raise exception 'office_floor_plan_forbidden' using errcode = '42501';
  end if;

  if jsonb_typeof(p_placements) <> 'array'
    or jsonb_array_length(p_placements) > 1000 then
    raise exception 'invalid_office_floor_plan_layout' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_placements) as placement(
      entity_type text,
      entity_id uuid,
      floor smallint,
      x double precision,
      y double precision,
      display_metadata jsonb
    )
    where entity_type not in ('workstation', 'equipment')
      or entity_id is null
      or floor not in (1, 2)
      or x not between 0 and 1
      or y not between 0 and 1
      or (display_metadata is not null and jsonb_typeof(display_metadata) <> 'object')
  ) then
    raise exception 'invalid_office_floor_plan_layout' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_placements) as placement(entity_type text, entity_id uuid)
  ) <> (
    select count(distinct (entity_type, entity_id))
    from jsonb_to_recordset(p_placements) as placement(entity_type text, entity_id uuid)
  ) then
    raise exception 'duplicate_office_floor_plan_entity' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_placements) as placement(entity_type text, entity_id uuid)
    left join public.workstations as workstation
      on placement.entity_type = 'workstation'
      and workstation.studio_id = p_studio_id
      and workstation.id = placement.entity_id
      and workstation.workstation_type = 'office'
    left join public.equipment as item
      on placement.entity_type = 'equipment'
      and item.studio_id = p_studio_id
      and item.id = placement.entity_id
      and item.equipment_type in ('air_conditioner', 'printer', 'coffee_machine', 'other')
    where (placement.entity_type = 'workstation' and workstation.id is null)
      or (placement.entity_type = 'equipment' and item.id is null)
  ) then
    raise exception 'invalid_office_floor_plan_entity' using errcode = '23503';
  end if;

  delete from public.office_floor_plan_placements where studio_id = p_studio_id;

  insert into public.office_floor_plan_placements(
    studio_id,
    workstation_id,
    equipment_id,
    floor,
    x,
    y,
    display_metadata
  )
  select
    p_studio_id,
    case when placement.entity_type = 'workstation' then placement.entity_id end,
    case when placement.entity_type = 'equipment' then placement.entity_id end,
    placement.floor,
    placement.x,
    placement.y,
    coalesce(placement.display_metadata, '{}'::jsonb)
  from jsonb_to_recordset(p_placements) as placement(
    entity_type text,
    entity_id uuid,
    floor smallint,
    x double precision,
    y double precision,
    display_metadata jsonb
  );

  get diagnostics saved_count = row_count;
  return saved_count;
end;
$$;

revoke execute on function public.save_office_floor_plan_layout(uuid, jsonb)
from public, anon;
grant execute on function public.save_office_floor_plan_layout(uuid, jsonb)
to authenticated, service_role;
