-- Reuse the existing case-insensitive, studio-scoped asset identity. Existing
-- values are reserved verbatim before allocating identifiers to untagged rows.
create table private.equipment_inventory_codes (
  studio_id uuid not null references public.studios(id) on delete cascade,
  code text not null,
  primary key (studio_id, code),
  check (code = lower(code))
);
create table private.equipment_inventory_counters (
  studio_id uuid not null references public.studios(id) on delete cascade,
  prefix text not null,
  last_number bigint not null check (last_number > 0),
  primary key (studio_id, prefix)
);
alter table private.equipment_inventory_codes enable row level security;
alter table private.equipment_inventory_counters enable row level security;
revoke all on private.equipment_inventory_codes, private.equipment_inventory_counters
from public, anon, authenticated, service_role;

insert into private.equipment_inventory_codes (studio_id, code)
select studio_id, lower(asset_tag) from public.equipment where asset_tag is not null;

create function private.reserve_equipment_inventory_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_prefix text;
  next_number bigint;
begin
  -- Internal migration/fixture writes are trusted; caller writes retain the
  -- same admin boundary before accessing the private reservation namespace.
  if current_setting('role', true) = 'authenticated'
    and not private.is_studio_admin(new.studio_id) then
    raise exception 'equipment row-level security policy' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.asset_tag is not null then
    if new.asset_tag is null then
      raise exception 'inventory_code_required' using errcode = '23514';
    end if;
    if lower(new.asset_tag) = lower(old.asset_tag) then return new; end if;
  end if;

  if new.asset_tag is not null then
    -- Never release a reservation on rename, retirement, or equipment deletion.
    insert into private.equipment_inventory_codes(studio_id, code)
    values (new.studio_id, lower(new.asset_tag));
    return new;
  end if;

  code_prefix := case new.equipment_type
    when 'pc' then 'PC' when 'laptop' then 'LAP'
    when 'monitor' then 'MON' when 'mouse' then 'MOU'
    when 'keyboard' then 'KBD' when 'headphones' then 'HEAD'
    when 'webcam' then 'CAM' when 'air_conditioner' then 'AC'
    when 'printer' then 'PRN' when 'coffee_machine' then 'COF'
    when 'other' then 'EQ'
  end;
  loop
    -- The upsert locks only this studio/prefix counter; the ledger also resolves
    -- races against manually assigned codes. Both writes share the transaction.
    insert into private.equipment_inventory_counters as counter(studio_id, prefix, last_number)
    values (new.studio_id, code_prefix, 1)
    on conflict (studio_id, prefix) do update set last_number = counter.last_number + 1
    returning last_number into next_number;
    new.asset_tag := code_prefix || '-' || lpad(next_number::text, greatest(2, length(next_number::text)), '0');
    insert into private.equipment_inventory_codes(studio_id, code)
    values (new.studio_id, lower(new.asset_tag)) on conflict do nothing;
    exit when found;
  end loop;
  return new;
end;
$$;
revoke execute on function private.reserve_equipment_inventory_code()
from public, anon, authenticated, service_role;
create trigger reserve_equipment_inventory_code_before_write
before insert or update of asset_tag on public.equipment
for each row execute function private.reserve_equipment_inventory_code();

-- Do not touch existing identifiers, serial numbers, specifications or schedules.
do $$
declare target record;
begin
  for target in select id from public.equipment where asset_tag is null order by created_at, id loop
    update public.equipment set asset_tag = null where id = target.id;
  end loop;
end;
$$;
alter table public.equipment alter column asset_tag set not null;

create type public.workstation_type as enum ('office', 'remote');
alter table public.workstations add column workstation_type public.workstation_type not null default 'office';

create or replace function public.create_workstations(
  p_studio_id uuid,
  p_workstations jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_ids uuid[];
begin
  if not private.is_studio_admin(p_studio_id) then
    raise exception 'workstation_create_forbidden';
  end if;

  if jsonb_typeof(p_workstations) <> 'array'
    or jsonb_array_length(p_workstations) not between 1 and 50 then
    raise exception 'invalid_workstation_batch';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_workstations) as workstation(number integer, name text, assigned_employee_id uuid, workstation_type public.workstation_type)
    where number is null
      or number <= 0
      or (name is not null and (name <> btrim(name) or char_length(name) not between 1 and 120))
  ) then
    raise exception 'invalid_workstation_batch';
  end if;

  if (select count(*) from jsonb_to_recordset(p_workstations) as workstation(number integer))
    <> (select count(distinct number) from jsonb_to_recordset(p_workstations) as workstation(number integer)) then
    raise exception 'duplicate_workstation_number';
  end if;

  if (select count(*) from jsonb_to_recordset(p_workstations) as workstation(assigned_employee_id uuid) where assigned_employee_id is not null)
    <> (select count(distinct assigned_employee_id) from jsonb_to_recordset(p_workstations) as workstation(assigned_employee_id uuid) where assigned_employee_id is not null) then
    raise exception 'duplicate_workstation_employee';
  end if;

  if exists (
    select 1
    from public.workstations as existing
    join jsonb_to_recordset(p_workstations) as workstation(number integer)
      on workstation.number = existing.number
    where existing.studio_id = p_studio_id
  ) then
    raise exception 'workstation_number_conflict';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_workstations) as workstation(assigned_employee_id uuid)
    where workstation.assigned_employee_id is not null
      and (
        not exists (
          select 1
          from public.studio_members as member
          join public.profiles as profile on profile.id = member.user_id
          where member.studio_id = p_studio_id
            and member.user_id = workstation.assigned_employee_id
            and member.is_active
            and profile.is_active
        )
        or exists (
          select 1
          from public.workstations as existing
          where existing.studio_id = p_studio_id
            and existing.assigned_employee_id = workstation.assigned_employee_id
        )
      )
  ) then
    raise exception 'workstation_employee_unavailable';
  end if;

  with inserted as (
    insert into public.workstations (studio_id, number, name, assigned_employee_id, workstation_type)
    select
      p_studio_id,
      workstation.number,
      nullif(btrim(workstation.name), ''),
      workstation.assigned_employee_id,
      coalesce(workstation.workstation_type, 'office'::public.workstation_type)
    from jsonb_to_recordset(p_workstations) as workstation(number integer, name text, assigned_employee_id uuid, workstation_type public.workstation_type)
    returning id, number
  )
  select array_agg(id order by number) into created_ids
  from inserted;

  return created_ids;
end;
$$;

revoke execute on function public.create_workstations(uuid, jsonb)
from public, anon, service_role;
grant execute on function public.create_workstations(uuid, jsonb)
to authenticated;
