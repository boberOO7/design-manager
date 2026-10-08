-- Keep the existing atomic save, ownership checks and historical editing.
-- Future submissions are rejected at the authenticated RPC boundary in Kyiv.
create or replace function public.save_daily_work_log(p_work_date date, p_entries jsonb)
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
  if p_work_date > (now() at time zone 'Europe/Kyiv')::date then
    raise exception 'Work time cannot be logged for a future date';
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
  insert into public.work_log_days(studio_id, user_id, work_date, submitted_at)
  values (actor_studio, actor, p_work_date, clock_timestamp())
  on conflict (studio_id, user_id, work_date) do update set submitted_at = excluded.submitted_at;
end;
$$;
revoke all on function public.save_daily_work_log(date, jsonb) from public, anon;
grant execute on function public.save_daily_work_log(date, jsonb) to authenticated;

notify pgrst, 'reload schema';
