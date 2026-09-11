alter table public.workstations
  add column number integer;

with numbered_workstations as (
  select id, row_number() over (partition by studio_id order by created_at, id)::integer as number
  from public.workstations
)
update public.workstations as workstation
set number = numbered_workstations.number
from numbered_workstations
where workstation.id = numbered_workstations.id;

alter table public.workstations
  alter column number set not null,
  alter column name drop not null,
  add constraint workstations_number_positive check (number > 0);

drop index public.workstations_studio_name_unique_idx;

create unique index workstations_studio_number_unique_idx
  on public.workstations (studio_id, number);

do $$
begin
  if exists (
    select 1
    from public.workstations
    where assigned_employee_id is not null
    group by studio_id, assigned_employee_id
    having count(*) > 1
  ) then
    raise exception 'workstation_employee_assignment_conflict';
  end if;
end;
$$;

create unique index workstations_studio_assigned_employee_unique_idx
  on public.workstations (studio_id, assigned_employee_id)
  where assigned_employee_id is not null;

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
    from jsonb_to_recordset(p_workstations) as workstation(number integer, name text, assigned_employee_id uuid)
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
    insert into public.workstations (studio_id, number, name, assigned_employee_id)
    select
      p_studio_id,
      workstation.number,
      nullif(btrim(workstation.name), ''),
      workstation.assigned_employee_id
    from jsonb_to_recordset(p_workstations) as workstation(number integer, name text, assigned_employee_id uuid)
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
