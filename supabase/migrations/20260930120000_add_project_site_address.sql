alter table public.crm_leads add column site_address text check (site_address is null or char_length(btrim(site_address)) <= 500);
alter table public.projects add column site_address text check (site_address is null or char_length(btrim(site_address)) <= 500);

grant update (site_address) on public.crm_leads to authenticated;
grant update (site_address) on public.projects to authenticated;

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
      or new.site_address is distinct from old.site_address
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
before update of project_type, project_type_custom, country_code, city, city_geonames_id, site_address on public.projects
for each row execute function private.enforce_structured_project_metadata();

create or replace function public.create_project_from_template(
  p_project jsonb,
  p_stage_assignees jsonb default '[]'::jsonb,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_project_id uuid;
  current_studio_id uuid;
  project_type_value text;
  selected_template_id uuid;
  source_lead_id uuid;
  source_lead_status public.crm_lead_status;
  source_project_id uuid;
  assignee record;
  template_stage text;
  stage_assignee_id uuid;
begin
  current_studio_id := (p_project->>'studio_id')::uuid;
  if current_studio_id is null or not coalesce(private.is_studio_admin(current_studio_id), false) then
    raise exception 'Only active studio administrators can create projects';
  end if;

  if jsonb_typeof(p_stage_assignees) <> 'array'
    or exists (
      select 1
      from jsonb_to_recordset(p_stage_assignees) as a(stage text, assignee_id uuid)
      where a.stage not in ('stage_1', 'stage_2', 'stage_3', 'stage_4')
    ) then
    raise exception 'Choose valid stage assignees';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_stage_assignees) as a(stage text, assignee_id uuid)
  ) <> (
    select count(distinct stage)
    from jsonb_to_recordset(p_stage_assignees) as a(stage text, assignee_id uuid)
  ) then
    raise exception 'Choose only one assignee per stage';
  end if;

  project_type_value := nullif(p_project->>'project_type', '');
  source_lead_id := nullif(p_project->>'source_lead_id', '')::uuid;

  if source_lead_id is not null then
    select lead.status, lead.project_id
    into source_lead_status, source_project_id
    from public.crm_leads as lead
    where lead.id = source_lead_id
      and lead.studio_id = current_studio_id
    for update;

    if not found then
      raise exception 'Lead was not found';
    end if;
    if source_project_id is not null then
      raise exception 'Lead is already linked to a project';
    end if;
    if source_lead_status = 'lost' then
      raise exception 'A lost lead cannot be converted to a project';
    end if;
  end if;

  if p_template_id is not null then
    select id
    into selected_template_id
    from public.project_templates
    where id = p_template_id
      and studio_id = current_studio_id
      and project_type = project_type_value
      and is_active;

    if selected_template_id is null then
      raise exception 'Choose an active template matching this project type';
    end if;
  end if;

  insert into public.projects (
    studio_id, created_by, name, project_type, project_type_custom, country_code,
    city, city_geonames_id, site_address, client_name, description, total_area_m2, status,
    priority, start_date, due_date
  ) values (
    current_studio_id,
    auth.uid(),
    btrim(p_project->>'name'),
    project_type_value,
    case when project_type_value = 'other' then nullif(btrim(p_project->>'project_type_custom'), '') else null end,
    p_project->>'country_code',
    nullif(btrim(p_project->>'city'), ''),
    nullif(p_project->>'city_geonames_id', '')::integer,
    nullif(btrim(p_project->>'site_address'), ''),
    nullif(btrim(p_project->>'client_name'), ''),
    nullif(btrim(p_project->>'description'), ''),
    (p_project->>'total_area_m2')::numeric,
    'planned',
    p_project->>'priority',
    (p_project->>'start_date')::date,
    nullif(p_project->>'due_date', '')::date
  ) returning id into new_project_id;

  if selected_template_id is not null then
    for assignee in
      select distinct a.assignee_id
      from jsonb_to_recordset(p_stage_assignees) as a(stage text, assignee_id uuid)
      where a.assignee_id is not null
    loop
      if not exists (
        select 1
        from public.studio_members as member
        join public.profiles as profile on profile.id = member.user_id
        where member.studio_id = current_studio_id
          and member.user_id = assignee.assignee_id
          and member.is_active
          and profile.is_active
      ) then
        raise exception 'A selected assignee is not an active studio member';
      end if;

      insert into public.project_members (
        project_id, user_id, project_role, assigned_area_m2, assigned_at
      ) values (
        new_project_id, assignee.assignee_id, 'other', 0, current_date
      ) on conflict (project_id, user_id) where is_active do nothing;
    end loop;

    for template_stage in
      select unnest(array['stage_1', 'stage_2', 'stage_3', 'stage_4']::text[])
    loop
      stage_assignee_id := null;
      select assignment.assignee_id
      into stage_assignee_id
      from jsonb_to_recordset(p_stage_assignees) as assignment(stage text, assignee_id uuid)
      where assignment.stage = template_stage;

      perform private.copy_project_template_stage_tasks(
        new_project_id,
        selected_template_id,
        template_stage,
        template_stage,
        stage_assignee_id
      );
    end loop;
  end if;

  if source_lead_id is not null then
    update public.crm_leads
    set project_id = new_project_id,
        status = 'won'
    where id = source_lead_id
      and studio_id = current_studio_id;

    insert into public.crm_lead_history (
      studio_id, lead_id, event_type, actor_id, project_id
    ) values (
      current_studio_id, source_lead_id, 'project_linked', auth.uid(), new_project_id
    );
  end if;

  return new_project_id;
end;
$$;
