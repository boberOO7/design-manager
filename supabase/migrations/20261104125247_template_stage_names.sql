begin;

-- Names are independent of stable stage identities and production semantics.
create function private.valid_template_stage_names(names jsonb) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(names)='object' then not exists (
    select 1 from jsonb_each(names) entry
    where entry.key not in ('stage_1','stage_2','stage_3','stage_4')
      or jsonb_typeof(entry.value)<>'string'
      or char_length(btrim(entry.value #>> '{}')) not between 1 and 80
  ) else false end;
$$;
revoke all on function private.valid_template_stage_names(jsonb) from public,anon;
grant execute on function private.valid_template_stage_names(jsonb) to authenticated;

alter table public.project_templates add column stage_names jsonb not null default '{}'
  check(private.valid_template_stage_names(stage_names));

-- Optional argument preserves older callers and omitted settings on later saves.
drop function public.save_project_template(uuid,text,text,boolean,boolean,jsonb,uuid,jsonb);
create function public.save_project_template(
  p_studio_id uuid, p_project_type text, p_name text, p_is_active boolean,
  p_is_default boolean, p_tasks jsonb, p_template_id uuid default null, p_stage_progress_methods jsonb default null,
  p_stage_names jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved_template_id uuid;
  normalized_name text := btrim(p_name);
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then raise exception 'Only studio administrators can manage project templates'; end if;
  if p_stage_progress_methods is not null and not private.valid_stage_progress_methods(p_stage_progress_methods) then
    raise exception 'Choose valid template progress methods'; end if;
  if p_stage_names is not null and not private.valid_template_stage_names(p_stage_names) then
    raise exception 'Choose valid template stage names'; end if;
  if p_project_type not in ('private','commercial','horeca','medical','other') then raise exception 'Choose a valid project type'; end if;
  if char_length(normalized_name) not between 1 and 120 or jsonb_typeof(p_tasks) <> 'array' then raise exception 'Provide a valid template name and task list'; end if;
  if p_is_default and not p_is_active then raise exception 'A default template must be active'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_tasks) as task(stage text, title text, priority text,
      checklist_template_id uuid, expected_workdays integer, depends_on_positions integer[], dependency_mode text)
    where task.stage not in ('stage_1','stage_2','stage_3','stage_4')
      or char_length(btrim(coalesce(task.title,''))) not between 1 and 200
      or task.priority not in ('low','normal','high','urgent')
      or task.expected_workdays <= 0
      or (task.dependency_mode is not null and task.dependency_mode not in ('after_previous','independent','custom'))
      or (task.checklist_template_id is not null and not exists (
        select 1 from public.checklist_templates checklist
        where checklist.id = task.checklist_template_id and checklist.studio_id = p_studio_id
      ))
  ) then raise exception 'Each template task needs a valid stage, title, duration, and checklist template'; end if;
  if exists (
    with input as (
      select ordinality::integer - 1 as position, task.stage, task.expected_workdays,
        coalesce(task.depends_on_positions, '{}'::integer[]) as dependencies,
        coalesce(task.dependency_mode, case
          when cardinality(coalesce(task.depends_on_positions, '{}'::integer[]))>0 then 'custom'
          else 'independent' end) as mode,
        lag(ordinality::integer - 1) over (partition by task.stage order by ordinality) as previous_position,
        lag(task.expected_workdays) over (partition by task.stage order by ordinality) as previous_duration
      from rows from (jsonb_to_recordset(p_tasks) as (
        stage text, expected_workdays integer, depends_on_positions integer[], dependency_mode text
      )) with ordinality as task(stage, expected_workdays, depends_on_positions, dependency_mode, ordinality)
    )
    select 1 from input child
    where child.mode not in ('after_previous','independent','custom')
      or (child.mode='independent' and cardinality(child.dependencies)>0)
      or (child.expected_workdays is null and cardinality(child.dependencies)>0)
      or (child.mode='custom' and child.expected_workdays is not null and cardinality(child.dependencies)=0)
      or (child.mode='after_previous' and child.expected_workdays is not null
        and (child.previous_position is null or child.previous_duration is null
          or child.dependencies<>array[child.previous_position]))
  ) or exists (
    with input as (
      select ordinality::integer - 1 as position, task.stage, task.expected_workdays,
        coalesce(task.depends_on_positions, '{}'::integer[]) as dependencies
      from rows from (jsonb_to_recordset(p_tasks) as (
        stage text, expected_workdays integer, depends_on_positions integer[]
      )) with ordinality as task(stage, expected_workdays, depends_on_positions, ordinality)
    )
    select 1 from input child
    cross join lateral unnest(child.dependencies) as dependency(position)
    left join input predecessor on predecessor.position = dependency.position
    where child.expected_workdays is null or predecessor.stage is distinct from child.stage
      or predecessor.expected_workdays is null or dependency.position >= child.position
  ) or exists (
    select 1 from jsonb_to_recordset(p_tasks) as task(depends_on_positions integer[])
    where cardinality(coalesce(task.depends_on_positions, '{}'::integer[]))
      <> (select count(distinct position) from unnest(coalesce(task.depends_on_positions, '{}'::integer[])) as position)
  ) then raise exception 'Dependencies must reference earlier scheduled tasks in the same stage'; end if;
  if exists (
    with recursive edges as (
      select task.ordinality::integer - 1 as child_position, dependency.position as predecessor_position
      from rows from (jsonb_to_recordset(p_tasks) as (depends_on_positions integer[]))
        with ordinality as task(depends_on_positions,ordinality)
      cross join lateral unnest(coalesce(task.depends_on_positions,'{}'::integer[])) as dependency(position)
    ), reach as (
      select child_position, predecessor_position as ancestor_position from edges
      union
      select reach.child_position, edge.predecessor_position
      from reach join edges edge on edge.child_position=reach.ancestor_position
    )
    select 1 from edges direct
    join edges other on other.child_position=direct.child_position
      and other.predecessor_position<>direct.predecessor_position
    join reach on reach.child_position=other.predecessor_position
      and reach.ancestor_position=direct.predecessor_position
  ) then raise exception 'Remove redundant direct dependencies'; end if;
  if p_is_default then
    update public.project_templates set is_default = false
    where studio_id = p_studio_id and project_type = p_project_type
      and is_default and id is distinct from p_template_id;
  end if;
  if p_template_id is null then
    insert into public.project_templates (studio_id,project_type,name,is_active,is_default,created_by)
    values (p_studio_id,p_project_type,normalized_name,p_is_active,p_is_default,auth.uid())
    returning id into saved_template_id;
  else
    update public.project_templates
    set project_type=p_project_type,name=normalized_name,is_active=p_is_active,is_default=p_is_default
    where id=p_template_id and studio_id=p_studio_id returning id into saved_template_id;
    if saved_template_id is null then raise exception 'Project template was not found'; end if;
    delete from public.project_template_tasks where template_id=saved_template_id;
  end if;
  insert into public.project_template_tasks(
    template_id,stage,title,priority,position,checklist_template_id,expected_workdays,dependency_mode,depends_on_positions
  )
  select saved_template_id,task.stage,btrim(task.title),task.priority,task.ordinality-1,
    task.checklist_template_id,task.expected_workdays,
    coalesce(task.dependency_mode, case
      when cardinality(coalesce(task.depends_on_positions,'{}'::integer[]))>0 then 'custom'
      else 'independent' end),
    coalesce(task.depends_on_positions, '{}'::integer[])
  from rows from (jsonb_to_recordset(p_tasks) as (
    stage text,title text,priority text,checklist_template_id uuid,
    expected_workdays integer,depends_on_positions integer[],dependency_mode text
  )) with ordinality as task(stage,title,priority,checklist_template_id,expected_workdays,depends_on_positions,dependency_mode,ordinality)
  order by task.ordinality;
  if jsonb_array_length(p_tasks) <> (select count(*) from public.project_template_tasks where template_id=saved_template_id)
    then raise exception 'Template tasks could not be saved'; end if;
  if p_stage_progress_methods is not null then
    update public.project_templates set stage_progress_methods=p_stage_progress_methods where id=saved_template_id;
  end if;
  if p_stage_names is not null then
    update public.project_templates set stage_names=(
      select coalesce(jsonb_object_agg(entry.key,btrim(entry.value)), '{}'::jsonb) from jsonb_each_text(p_stage_names) entry
    ) where id=saved_template_id;
  end if;
  return saved_template_id;
end;
$$;

revoke all on function public.save_project_template(uuid,text,text,boolean,boolean,jsonb,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_project_template(uuid,text,text,boolean,boolean,jsonb,uuid,jsonb,jsonb) to authenticated;


-- Copy names at creation only. Existing project labels remain independent.
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
  direction_input jsonb;
  configuration_version integer;
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

  if p_project ? 'directions' and jsonb_typeof(p_project->'directions') is distinct from 'array' then
    raise exception 'direction_invalid';
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
    update public.project_task_stage_columns s set progress_method=coalesce(t.stage_progress_methods->>s.stage,'equal'),
      display_name=coalesce(t.stage_names->>s.stage,s.display_name)
    from public.project_templates t where s.project_id=new_project_id and t.id=selected_template_id;
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

  -- Use the same guarded creation/template path as adding a direction later.
  -- Every call is part of this transaction, including CRM conversion above/below.
  for direction_input in select value from jsonb_array_elements(coalesce(p_project->'directions','[]'::jsonb)) loop
    if jsonb_typeof(direction_input) is distinct from 'object'
      or direction_input->>'intent' is distinct from 'save'
      or nullif(direction_input->>'id','') is not null
      or direction_input->>'kind' is null then
      raise exception 'direction_invalid';
    end if;
    select stage_configuration_version into configuration_version from public.projects where id=new_project_id;
    perform public.save_project_work_direction(new_project_id, direction_input || jsonb_build_object(
      'startDate', p_project->>'start_date', 'dueDate', p_project->>'due_date'
    ), configuration_version);
  end loop;

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

revoke all on function public.create_project_from_template(jsonb,jsonb,uuid) from public,anon;
grant execute on function public.create_project_from_template(jsonb,jsonb,uuid) to authenticated;

notify pgrst,'reload schema';

create or replace function private.save_project_work_direction(p_project_id uuid,p_input jsonb,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare project public.projects; direction public.project_work_directions; result uuid;
  intent text:=p_input->>'intent'; stage_key text; source_stage text; position integer; other_direction uuid;
  requested_id uuid:=nullif(p_input->>'id','')::uuid; v_template_id uuid:=nullif(p_input->>'templateId','')::uuid;
  area numeric:=(p_input->>'areaM2')::numeric; coefficient numeric:=(p_input->>'coefficient')::numeric; components jsonb;
begin
  select * into project from public.projects where id=p_project_id for update;
  if not found or not coalesce(private.is_studio_admin(project.studio_id),false) then raise exception 'direction_not_admin'; end if;
  if project.status='archived' or project.archived_at is not null then raise exception 'direction_read_only'; end if;
  if project.stage_configuration_version is distinct from p_expected_version then raise exception 'direction_version_conflict'; end if;
  if requested_id is not null then
    select * into direction from public.project_work_directions where id=requested_id and project_id=p_project_id;
    if not found then raise exception 'direction_invalid'; end if;
  end if;
  if intent='remove' then
    if direction.id is null or direction.is_default
      or exists(select 1 from public.tasks t join public.project_task_stage_columns s on s.project_id=t.project_id and s.stage=t.stage where s.direction_id=direction.id)
      or exists(select 1 from public.finance_order_work_directions where direction_id=direction.id)
      or exists(select 1 from public.productivity_attributions where direction_id=direction.id)
      or exists(select 1 from public.finance_project_earning_milestones m join public.project_task_stage_columns s on s.project_id=m.project_id and s.stage=m.stage where s.direction_id=direction.id)
      then raise exception 'direction_has_work'; end if;
    delete from public.project_task_stage_columns where direction_id=direction.id;
    delete from public.project_work_directions where id=direction.id;
    result:=direction.id;
  elsif intent in ('up','down') then
    if direction.id is null then raise exception 'direction_invalid'; end if;
    select id into other_direction from public.project_work_directions where project_id=p_project_id and id<>direction.id
      and case when intent='up' then (display_order,id)<(direction.display_order,direction.id) else (display_order,id)>(direction.display_order,direction.id) end
      order by case when intent='up' then -display_order else display_order end,id limit 1;
    if other_direction is not null then
      update public.project_work_directions set display_order=case when id=direction.id then (select display_order from public.project_work_directions where id=other_direction) else direction.display_order end
      where id in (direction.id,other_direction);
    end if;
    result:=direction.id;
  elsif intent='save' then
    if project.status='completed' then raise exception 'direction_read_only'; end if;
    components:=case when p_input ? 'areaComponents' then nullif(p_input->'areaComponents','null'::jsonb) else direction.area_components end;
    if not private.valid_work_direction_components(components) then raise exception 'direction_invalid'; end if;
    if char_length(btrim(coalesce(p_input->>'name',''))) not between 1 and 80 or area is null or not(area>0 and area<'Infinity'::numeric)
      or coefficient is null or not(coefficient>0 and coefficient<'Infinity'::numeric) then raise exception 'direction_invalid'; end if;
    if direction.id is null then
      select coalesce(max(display_order),0)+1 into position from public.project_work_directions where project_id=p_project_id;
      insert into public.project_work_directions(studio_id,project_id,name,display_order,area_m2,complexity_coefficient,area_components,start_date,due_date)
      values(project.studio_id,p_project_id,btrim(p_input->>'name'),position,area,coefficient,components,nullif(p_input->>'startDate','')::date,nullif(p_input->>'dueDate','')::date) returning id into result;
      select coalesce(max(display_order),0) into position from public.project_task_stage_columns where project_id=p_project_id;
      if v_template_id is not null and not exists(select 1 from public.project_templates where id=v_template_id and studio_id=project.studio_id and is_active) then raise exception 'direction_invalid'; end if;
      foreach source_stage in array array['stage_1','stage_2','stage_3','stage_4'] loop
        stage_key:='custom_'||gen_random_uuid()::text; position:=position+1;
        insert into public.project_task_stage_columns(project_id,stage,direction_id,display_name,display_order,kind,progress_weight,productivity_role,progress_method)
        values(p_project_id,stage_key,result,coalesce((select stage_names->>source_stage from public.project_templates where id=v_template_id),p_input->'stageNames'->>source_stage,source_stage),position,
          case when source_stage='stage_4' then 'additional' else 'work' end,
          case when source_stage in ('stage_2','stage_3') then 2 else 1 end,
          case source_stage when 'stage_1' then 'initial' when 'stage_2' then 'visualization' when 'stage_3' then 'final' else 'none' end,
          case when v_template_id is not null then coalesce((select stage_progress_methods->>source_stage from public.project_templates where id=v_template_id),'equal')
            else coalesce((select stage_progress_methods->>source_stage from public.studio_direction_presets where studio_id=project.studio_id and kind=p_input->>'kind'),'equal') end);
        if v_template_id is not null and exists(select 1 from public.project_template_tasks where template_id=v_template_id and stage=source_stage) then
          perform public.apply_project_template_stage(p_project_id,v_template_id,source_stage,stage_key,nullif(p_input->>'startDate','')::date);
        end if;
      end loop;
    else
      update public.project_work_directions set name=btrim(p_input->>'name'),area_m2=area,complexity_coefficient=coefficient,area_components=components,
        start_date=nullif(p_input->>'startDate','')::date,due_date=nullif(p_input->>'dueDate','')::date where id=direction.id;
      result:=direction.id;
    end if;
  else raise exception 'direction_invalid'; end if;
  update public.projects set stage_configuration_version=stage_configuration_version+1 where id=p_project_id;
  return result;
end $$;


commit;
