alter table public.projects
  add column project_type_custom text check (project_type_custom is null or char_length(btrim(project_type_custom)) between 1 and 100);

drop trigger enforce_structured_project_metadata_before_update on public.projects;

update public.projects
set
  project_type = case
    when project_type is null then null
    when lower(btrim(project_type)) in ('private', 'residential') then 'private'
    when lower(btrim(project_type)) in ('commercial', 'office', 'retail', 'public', 'industrial', 'mixed_use') then 'commercial'
    when lower(btrim(project_type)) in ('horeca', 'hospitality') then 'horeca'
    when lower(btrim(project_type)) = 'medical' then 'medical'
    when lower(btrim(project_type)) = 'other' then 'other'
    else 'other'
  end,
  project_type_custom = case
    when project_type is null then null
    when lower(btrim(project_type)) = 'other' then nullif(btrim(project_type_custom), '')
    when lower(btrim(project_type)) in ('private', 'residential', 'commercial', 'office', 'retail', 'public', 'industrial', 'mixed_use', 'horeca', 'hospitality', 'medical') then null
    else coalesce(nullif(btrim(project_type_custom), ''), nullif(btrim(project_type), ''))
  end;

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
      'private', 'commercial', 'horeca', 'medical', 'other'
    ) then
    raise exception 'Project type must be a canonical key or null';
  end if;

  if new.project_type is distinct from 'other' then
    new.project_type_custom := null;
  elsif new.project_type_custom is not null then
    new.project_type_custom := nullif(btrim(new.project_type_custom), '');
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('completed', 'archived') and (
      new.project_type is distinct from old.project_type
      or new.project_type_custom is distinct from old.project_type_custom
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

create trigger enforce_structured_project_metadata_before_update
before update of project_type, project_type_custom, country_code, city, city_geonames_id on public.projects
for each row execute function private.enforce_structured_project_metadata();

grant insert (project_type_custom) on table public.projects to authenticated;
grant update (project_type_custom) on table public.projects to authenticated;
