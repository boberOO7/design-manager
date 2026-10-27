-- Studio-wide m² allocation is independent of stage progress weights and labels.
-- Preserve 20/80 until an administrator explicitly changes the studio setting.
alter table public.studios
  add column productivity_stage_1_percent numeric not null default 20
  check (productivity_stage_1_percent between 0 and 100);
grant select (productivity_stage_1_percent) on public.studios to authenticated;

create function private.productivity_stage_ratio(p_studio_id uuid, p_stage text)
returns numeric language sql stable set search_path = '' as $$
  select case p_stage
    when 'stage_1' then studio.productivity_stage_1_percent / 100
    when 'stage_3' then (100 - studio.productivity_stage_1_percent) / 100
    else 0::numeric end
  from public.studios studio where studio.id = p_studio_id;
$$;
revoke all on function private.productivity_stage_ratio(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.rebalance_stage_productivity(p_project_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_area numeric;
  project_studio_id uuid;
  stage_budget numeric;
  eligible_count integer;
  base_share numeric;
begin
  if p_stage not in ('stage_1', 'stage_3') then return; end if;

  -- Serialize roster and area changes for this project before counting tasks.
  select greatest(coalesce(total_area_m2, 0), 0), studio_id into project_area, project_studio_id
  from public.projects where id = p_project_id for update;
  if not found then return; end if;
  stage_budget := project_area * private.productivity_stage_ratio(project_studio_id, p_stage);
  select count(*) into eligible_count from public.tasks
  where project_id = p_project_id and stage = p_stage and status <> 'cancelled';
  base_share := case when eligible_count > 0 then trunc(stage_budget / eligible_count, 12) else 0 end;

  insert into public.project_stage_productivity_budgets
    (project_id, stage, project_area_m2, productivity_budget_m2, allocated_productivity_m2)
  values (p_project_id, p_stage, project_area, stage_budget, 0)
  on conflict (project_id, stage) do update set
    project_area_m2 = excluded.project_area_m2,
    productivity_budget_m2 = excluded.productivity_budget_m2,
    allocated_productivity_m2 = 0;

  -- The last UUID receives the rounding remainder, so stage shares sum
  -- exactly to the budget even with three or more tasks.
  with shares as (
    select id, status, case when row_number() over (order by id) = eligible_count
      then stage_budget - base_share * (eligible_count - 1)
      else base_share end as area
    from public.tasks
    where project_id = p_project_id and stage = p_stage and status <> 'cancelled'
  )
  update public.productivity_attributions as attribution
  set credited_area_m2 = shares.area, task_stage = p_stage
  from shares
  where attribution.task_id = shares.id and attribution.source_type = 'task'
    and attribution.voided_at is null and shares.status = 'completed'
    and (attribution.credited_area_m2 is distinct from shares.area
      or attribution.task_stage is distinct from p_stage);

  update public.project_stage_productivity_budgets as budget
  set allocated_productivity_m2 = coalesce((
    select sum(attribution.credited_area_m2)
    from public.productivity_attributions as attribution
    join public.tasks as task on task.id = attribution.task_id
    where task.project_id = p_project_id and task.stage = p_stage
      and task.status = 'completed' and attribution.source_type = 'task'
      and attribution.voided_at is null
  ), 0)
  where budget.project_id = p_project_id and budget.stage = p_stage;
end;
$$;
revoke execute on function private.rebalance_stage_productivity(uuid, text)
from public, anon, authenticated;

drop function private.productivity_stage_ratio(text);

create function public.save_productivity_stage_shares(p_studio_id uuid, p_stage_1_percent numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_percent numeric;
  project_id uuid;
begin
  if auth.uid() is null or not coalesce(private.is_studio_admin(p_studio_id), false)
    or not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Only active studio administrators can change productivity stage shares' using errcode = '42501';
  end if;
  if p_stage_1_percent is null or not (p_stage_1_percent between 0 and 100) then
    raise exception 'Enter a percentage from 0 to 100' using errcode = '22023';
  end if;

  -- Serialize settings saves and project creation (the studio FK takes KEY SHARE).
  select productivity_stage_1_percent into current_percent from public.studios
  where id = p_studio_id for update;
  if current_percent = p_stage_1_percent then return; end if;

  -- Task writes already serialize through the project row. Fail atomically if
  -- one is busy rather than waiting while holding the studio lock: completion
  -- attribution also references the studio and could otherwise deadlock.
  perform id from public.projects where studio_id = p_studio_id order by id for update nowait;
  update public.studios set productivity_stage_1_percent = p_stage_1_percent where id = p_studio_id;
  for project_id in select id from public.projects where studio_id = p_studio_id order by id loop
    perform private.rebalance_stage_productivity(project_id, 'stage_1');
    perform private.rebalance_stage_productivity(project_id, 'stage_3');
  end loop;
end;
$$;
revoke all on function public.save_productivity_stage_shares(uuid, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.save_productivity_stage_shares(uuid, numeric) to authenticated;
