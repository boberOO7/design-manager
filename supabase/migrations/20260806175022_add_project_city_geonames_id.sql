alter table public.projects
  add column city_geonames_id bigint;

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
      or new.city_geonames_id is distinct from old.city_geonames_id
    ) then
      raise exception 'Completed and archived project details are read-only';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_structured_project_metadata() from public, anon, authenticated;

drop trigger enforce_structured_project_metadata_before_update on public.projects;

create trigger enforce_structured_project_metadata_before_update
before update of project_type, country_code, city, city_geonames_id on public.projects
for each row execute function private.enforce_structured_project_metadata();

grant update (city_geonames_id) on table public.projects to authenticated;
