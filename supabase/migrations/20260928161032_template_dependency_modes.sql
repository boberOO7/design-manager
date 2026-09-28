-- Remember whether an edge follows the list order or names a deliberate task.
alter table public.project_template_tasks
  add column dependency_mode text not null default 'independent'
    check (dependency_mode in ('after_previous', 'independent', 'custom'));

-- Remove old direct edges already implied by another selected predecessor.
-- Reachability stays scoped to the template and stage.
with recursive edges as (
  select task.id as task_id, task.template_id, task.stage,
    task.position as child_position, predecessor_position
  from public.project_template_tasks task
  cross join lateral unnest(task.depends_on_positions) as predecessor(predecessor_position)
), reach as (
  select template_id, stage, child_position, predecessor_position as ancestor_position
  from edges
  union
  select reach.template_id, reach.stage, reach.child_position, edge.predecessor_position
  from reach
  join edges edge on edge.template_id=reach.template_id and edge.stage=reach.stage
    and edge.child_position=reach.ancestor_position
), redundant as (
  select distinct direct.task_id, direct.predecessor_position
  from edges direct
  join edges other on other.task_id=direct.task_id
    and other.predecessor_position<>direct.predecessor_position
  join reach on reach.template_id=direct.template_id and reach.stage=direct.stage
    and reach.child_position=other.predecessor_position
    and reach.ancestor_position=direct.predecessor_position
), cleaned as (
  select edge.task_id,
    array_agg(edge.predecessor_position order by edge.predecessor_position)
      filter (where redundant.task_id is null) as dependencies
  from edges edge
  left join redundant on redundant.task_id=edge.task_id
    and redundant.predecessor_position=edge.predecessor_position
  group by edge.task_id
)
update public.project_template_tasks task
set depends_on_positions=cleaned.dependencies
from cleaned where cleaned.task_id=task.id
  and cleaned.dependencies is not null
  and task.depends_on_positions is distinct from cleaned.dependencies;

-- Existing templates retain their effective graph. A single edge to the
-- immediate previous task becomes order-following; all other edges stay custom.
with stage_order as (
  select id, lag(position) over (
    partition by template_id,stage order by position,id
  ) as previous_position
  from public.project_template_tasks
)
update public.project_template_tasks task
set dependency_mode=case
  when task.expected_workdays is null or cardinality(task.depends_on_positions)=0 then 'independent'
  when task.depends_on_positions=array[stage_order.previous_position] then 'after_previous'
  else 'custom'
end
from stage_order where stage_order.id=task.id;

create or replace function public.save_project_template(
  p_studio_id uuid, p_project_type text, p_name text, p_is_active boolean,
  p_is_default boolean, p_tasks jsonb, p_template_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved_template_id uuid;
  normalized_name text := btrim(p_name);
begin
  if not coalesce(private.is_studio_admin(p_studio_id), false) then raise exception 'Only studio administrators can manage project templates'; end if;
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
  return saved_template_id;
end;
$$;
