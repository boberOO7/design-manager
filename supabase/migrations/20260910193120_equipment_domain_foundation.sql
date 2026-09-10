create type public.equipment_type as enum (
  'pc',
  'laptop',
  'monitor',
  'mouse',
  'keyboard',
  'headphones',
  'webcam',
  'air_conditioner',
  'printer',
  'coffee_machine',
  'other'
);

create type public.equipment_lifecycle_state as enum (
  'active',
  'spare',
  'in_service',
  'retired'
);

create table public.workstations (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  assigned_employee_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, id),
  foreign key (studio_id, assigned_employee_id)
    references public.studio_members(studio_id, user_id)
    on delete set null (assigned_employee_id)
);

create unique index workstations_studio_name_unique_idx
  on public.workstations(studio_id, lower(name));
create index workstations_studio_employee_idx
  on public.workstations(studio_id, assigned_employee_id)
  where assigned_employee_id is not null;

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  workstation_id uuid,
  equipment_type public.equipment_type not null,
  lifecycle_state public.equipment_lifecycle_state not null default 'active',
  display_name text not null
    check (display_name = btrim(display_name) and char_length(display_name) between 1 and 160),
  manufacturer text
    check (manufacturer is null or (manufacturer = btrim(manufacturer) and char_length(manufacturer) between 1 and 160)),
  model text
    check (model is null or (model = btrim(model) and char_length(model) between 1 and 160)),
  serial_number text
    check (serial_number is null or (serial_number = btrim(serial_number) and char_length(serial_number) between 1 and 160)),
  asset_tag text
    check (asset_tag is null or (asset_tag = btrim(asset_tag) and char_length(asset_tag) between 1 and 160)),
  cpu text check (cpu is null or (cpu = btrim(cpu) and char_length(cpu) between 1 and 500)),
  gpu text check (gpu is null or (gpu = btrim(gpu) and char_length(gpu) between 1 and 500)),
  ram text check (ram is null or (ram = btrim(ram) and char_length(ram) between 1 and 500)),
  storage text check (storage is null or (storage = btrim(storage) and char_length(storage) between 1 and 500)),
  notes text check (notes is null or char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, id),
  foreign key (studio_id, workstation_id)
    references public.workstations(studio_id, id)
    on delete set null (workstation_id),
  constraint equipment_computer_specs_match_type check (
    equipment_type in ('pc', 'laptop')
    or (cpu is null and gpu is null and ram is null and storage is null)
  )
);

create index equipment_studio_state_type_idx
  on public.equipment(studio_id, lifecycle_state, equipment_type);
create index equipment_studio_workstation_idx
  on public.equipment(studio_id, workstation_id)
  where workstation_id is not null;
create unique index equipment_studio_asset_tag_unique_idx
  on public.equipment(studio_id, lower(asset_tag))
  where asset_tag is not null;
create unique index equipment_studio_serial_number_unique_idx
  on public.equipment(studio_id, lower(serial_number))
  where serial_number is not null;

create trigger set_workstations_updated_at
  before update on public.workstations
  for each row execute function public.set_updated_at();

create trigger set_equipment_updated_at
  before update on public.equipment
  for each row execute function public.set_updated_at();

create or replace function private.enforce_workstation_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.studio_id is distinct from old.studio_id then
    raise exception 'workstation_studio_is_immutable';
  end if;

  if new.assigned_employee_id is not null and not exists (
    select 1
    from public.studio_members as member
    join public.profiles as profile on profile.id = member.user_id
    where member.studio_id = new.studio_id
      and member.user_id = new.assigned_employee_id
      and member.is_active
      and profile.is_active
  ) then
    raise exception 'assigned_employee_must_be_an_active_studio_member';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_workstation_assignment() from public, anon, authenticated;

create trigger enforce_workstation_assignment_before_write
  before insert or update on public.workstations
  for each row execute function private.enforce_workstation_assignment();

create or replace function private.enforce_equipment_studio_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.studio_id is distinct from old.studio_id then
    raise exception 'equipment_studio_is_immutable';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_equipment_studio_identity() from public, anon, authenticated;

create trigger enforce_equipment_studio_identity_before_update
  before update on public.equipment
  for each row execute function private.enforce_equipment_studio_identity();

alter table public.workstations enable row level security;
alter table public.equipment enable row level security;

revoke all on table public.workstations, public.equipment from anon, authenticated;
grant select, insert, update, delete on table public.workstations, public.equipment to authenticated;

create policy workstations_select_admin
on public.workstations for select to authenticated
using ((select private.is_studio_admin(studio_id)));

create policy workstations_insert_admin
on public.workstations for insert to authenticated
with check ((select private.is_studio_admin(studio_id)));

create policy workstations_update_admin
on public.workstations for update to authenticated
using ((select private.is_studio_admin(studio_id)))
with check ((select private.is_studio_admin(studio_id)));

create policy workstations_delete_admin
on public.workstations for delete to authenticated
using ((select private.is_studio_admin(studio_id)));

create policy equipment_select_admin
on public.equipment for select to authenticated
using ((select private.is_studio_admin(studio_id)));

create policy equipment_insert_admin
on public.equipment for insert to authenticated
with check ((select private.is_studio_admin(studio_id)));

create policy equipment_update_admin
on public.equipment for update to authenticated
using ((select private.is_studio_admin(studio_id)))
with check ((select private.is_studio_admin(studio_id)));

create policy equipment_delete_admin
on public.equipment for delete to authenticated
using ((select private.is_studio_admin(studio_id)));
