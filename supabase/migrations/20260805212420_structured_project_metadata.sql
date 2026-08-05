alter table public.projects
  add column country_code text;

update public.projects
set country_code = 'UA'
where country_code is null;

alter table public.projects
  alter column country_code set default 'UA',
  alter column country_code set not null,
  add constraint projects_country_code_iso_alpha_2
    check (country_code ~ '^[A-Z]{2}$');

create unique index projects_studio_project_code_unique
  on public.projects (studio_id, project_code)
  where project_code is not null and btrim(project_code) <> '';

create table private.project_code_counters (
  studio_id uuid not null references public.studios(id) on delete cascade,
  calendar_year integer not null check (calendar_year between 2000 and 9999),
  last_value integer not null check (last_value > 0),
  primary key (studio_id, calendar_year)
);

revoke all on table private.project_code_counters from public, anon, authenticated;

create or replace function private.assign_project_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_year integer := extract(year from timezone('Europe/Kyiv', current_timestamp));
  next_value integer;
  candidate text;
begin
  if new.project_code is not null and btrim(new.project_code) <> '' then
    return new;
  end if;

  loop
    insert into private.project_code_counters (studio_id, calendar_year, last_value)
    values (
      new.studio_id,
      code_year,
      coalesce((
        select max(
          case
            when project.project_code ~ ('^SPACE_' || code_year::text || '_[0-9]+$')
              then substring(project.project_code from '[0-9]+$')::integer
          end
        )
        from public.projects as project
        where project.studio_id = new.studio_id
      ), 0) + 1
    )
    on conflict (studio_id, calendar_year)
    do update set last_value = private.project_code_counters.last_value + 1
    returning last_value into next_value;

    candidate := 'SPACE_' || code_year::text || '_' || lpad(next_value::text, 3, '0');
    exit when not exists (
      select 1
      from public.projects as project
      where project.studio_id = new.studio_id
        and project.project_code = candidate
    );
  end loop;

  new.project_code := candidate;
  return new;
end;
$$;

revoke execute on function private.assign_project_code() from public, anon, authenticated;

create trigger assign_project_code_before_insert
before insert on public.projects
for each row execute function private.assign_project_code();

create or replace function private.enforce_structured_project_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.country_code !~ '^[A-Z]{2}$' then
    raise exception 'Project country must be an ISO 3166-1 alpha-2 uppercase code';
  end if;

  if new.project_type is not null and new.project_type not in (
      'residential', 'commercial', 'office', 'retail', 'hospitality',
      'public', 'industrial', 'mixed_use', 'other'
    ) then
    if tg_op = 'INSERT' then
      raise exception 'Project type must be a canonical key or null';
    end if;
    if new.project_type is distinct from old.project_type then
      raise exception 'Project type must be a canonical key or null';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('completed', 'archived') and (
      new.project_type is distinct from old.project_type
      or new.country_code is distinct from old.country_code
      or new.city is distinct from old.city
    ) then
      raise exception 'Completed and archived project details are read-only';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_structured_project_metadata() from public, anon, authenticated;

create trigger enforce_structured_project_metadata_before_insert
before insert on public.projects
for each row execute function private.enforce_structured_project_metadata();

create trigger enforce_structured_project_metadata_before_update
before update of project_type, country_code, city on public.projects
for each row execute function private.enforce_structured_project_metadata();

grant update (country_code) on table public.projects to authenticated;
