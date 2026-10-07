-- Work time is independent of task completion and productivity attribution.
alter table public.studios add column standard_workday_minutes integer not null default 480
  check (standard_workday_minutes > 0);
grant select (standard_workday_minutes) on public.studios to authenticated;

create function public.set_standard_workday_minutes(p_studio_id uuid, p_minutes integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(private.is_studio_admin(p_studio_id), false)
    or not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Only active studio administrators can change the standard workday';
  end if;
  if p_minutes is null or p_minutes <= 0 then raise exception 'Enter a positive duration in minutes'; end if;
  update public.studios set standard_workday_minutes = p_minutes where id = p_studio_id;
end;
$$;
revoke all on function public.set_standard_workday_minutes(uuid, integer) from public, anon;
grant execute on function public.set_standard_workday_minutes(uuid, integer) to authenticated;

alter table public.task_review_rounds add constraint task_review_rounds_id_task_key unique (id, task_id);
create table public.work_log_entries (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  work_date date not null,
  activity_kind text not null check (activity_kind in ('task', 'review')),
  task_id uuid not null references public.tasks(id) on delete cascade,
  review_round_id uuid,
  minutes integer not null check (minutes > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (review_round_id, task_id) references public.task_review_rounds(id, task_id) on delete cascade,
  check ((activity_kind = 'review') = (review_round_id is not null)),
  unique nulls not distinct (user_id, work_date, task_id, review_round_id)
);
create index work_log_entries_studio_date_idx on public.work_log_entries(studio_id, work_date);
create index work_log_entries_task_idx on public.work_log_entries(task_id);
create index work_log_entries_round_idx on public.work_log_entries(review_round_id) where review_round_id is not null;
alter table public.work_log_entries enable row level security;
revoke all on public.work_log_entries from anon, authenticated;
grant select on public.work_log_entries to authenticated;
grant all on public.work_log_entries to service_role;
create policy work_log_entries_read on public.work_log_entries for select to authenticated
using ((select private.is_studio_member(studio_id))
  and exists (select 1 from public.profiles where id = (select auth.uid()) and is_active)
  and (user_id = (select auth.uid()) or (select private.is_studio_admin(studio_id))));

-- Only this RPC writes logs: actor/studio cannot be supplied by the caller.
-- A day is saved atomically; zero/removed rows are omitted from the payload.
create function public.save_daily_work_log(p_work_date date, p_entries jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_studio uuid;
  entry record;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.user_id = actor and sm.is_active and p.is_active) <> 1 then
    raise exception 'An active studio membership is required';
  end if;
  select studio_id into actor_studio from public.studio_members where user_id = actor and is_active for update;
  if p_work_date is null or p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Enter a work date and work-log entries';
  end if;
  if exists (select 1 from jsonb_array_elements(p_entries) item
    where jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'minutes') is distinct from 'number'
      or (item->>'minutes')::numeric <= 0 or (item->>'minutes')::numeric <> trunc((item->>'minutes')::numeric)) then
    raise exception 'Enter positive whole minutes';
  end if;
  for entry in select * from jsonb_to_recordset(p_entries)
    as row(activity_kind text, task_id uuid, review_round_id uuid, minutes integer) loop
    if entry.activity_kind is null or entry.activity_kind not in ('task', 'review') or entry.task_id is null
      or (entry.activity_kind = 'review') <> (entry.review_round_id is not null) then
      raise exception 'Choose task work or a specific review round';
    end if;
    -- Existing entries remain editable if project access changes after logging.
    if not exists (select 1 from public.work_log_entries w where w.studio_id = actor_studio and w.user_id = actor
        and w.work_date = p_work_date and w.task_id = entry.task_id and w.review_round_id is not distinct from entry.review_round_id)
      and (not exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id
          where t.id = entry.task_id and p.studio_id = actor_studio and private.can_access_project(p.id))
        or (entry.activity_kind = 'review' and not exists (
          select 1 from public.task_review_round_reviewers rr join public.task_review_rounds r on r.id = rr.round_id
          where rr.round_id = entry.review_round_id and r.task_id = entry.task_id and rr.reviewer_id = actor
        ))) then raise exception 'Work-log activity is unavailable'; end if;
  end loop;
  if exists (select 1 from jsonb_to_recordset(p_entries) as row(task_id uuid, review_round_id uuid)
    group by task_id, review_round_id having count(*) > 1) then raise exception 'Work-log activities must be unique'; end if;
  delete from public.work_log_entries w where w.studio_id = actor_studio and w.user_id = actor
    and w.work_date = p_work_date and not exists (
      select 1 from jsonb_to_recordset(p_entries) as row(task_id uuid, review_round_id uuid)
      where row.task_id = w.task_id and row.review_round_id is not distinct from w.review_round_id);
  insert into public.work_log_entries(studio_id, user_id, work_date, activity_kind, task_id, review_round_id, minutes)
  select actor_studio, actor, p_work_date, row.activity_kind, row.task_id, row.review_round_id, row.minutes
  from jsonb_to_recordset(p_entries) as row(activity_kind text, task_id uuid, review_round_id uuid, minutes integer)
  on conflict (user_id, work_date, task_id, review_round_id) do update
    set minutes = excluded.minutes, updated_at = clock_timestamp();
end;
$$;
revoke all on function public.save_daily_work_log(date, jsonb) from public, anon;
grant execute on function public.save_daily_work_log(date, jsonb) to authenticated;

create index project_activity_actor_day_task_idx on public.project_activity(studio_id, actor_id, created_at)
  where entity_type = 'task';
create index project_activity_task_day_idx on public.project_activity(studio_id, created_at)
  where entity_type = 'task';

-- Extend the existing activity source to include actual progress/edit interactions.
create function private.log_task_work_interaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare task_id uuid; project_id uuid; studio_id uuid; changes jsonb;
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name = 'task_checklist_items' then
    if tg_op = 'UPDATE' and new.title = old.title and new.is_completed = old.is_completed
      and new.is_not_needed = old.is_not_needed and new.weight = old.weight then return null; end if;
    task_id := coalesce(new.task_id, old.task_id);
    changes := jsonb_build_object('checklist_item', coalesce(new.id, old.id), 'operation', tg_op);
  else
    if new.title is not distinct from old.title and new.description is not distinct from old.description
      and new.production_completion is not distinct from old.production_completion then return null; end if;
    task_id := new.id;
    changes := jsonb_build_object('work_details_updated', true);
  end if;
  select t.project_id, p.studio_id into project_id, studio_id
  from public.tasks t join public.projects p on p.id = t.project_id where t.id = task_id;
  if project_id is not null then
    perform private.record_project_activity(studio_id, project_id, 'task_updated', 'task', task_id, changes);
  end if;
  return null;
end;
$$;
revoke all on function private.log_task_work_interaction() from public, anon, authenticated;
create trigger log_task_work_details after update of title, description, production_completion on public.tasks
for each row execute function private.log_task_work_interaction();
create trigger log_task_checklist_work after insert or update or delete on public.task_checklist_items
for each row execute function private.log_task_work_interaction();
notify pgrst, 'reload schema';
