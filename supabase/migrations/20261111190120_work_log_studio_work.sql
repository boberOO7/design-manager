-- Keep both administrator activities in the existing internal-work category.
alter table public.work_log_entries drop constraint work_log_entries_internal_activity_check;
alter table public.work_log_entries add constraint work_log_entries_internal_activity_check check (
  (activity_kind = 'internal' and task_id is null and review_round_id is null
    and internal_activity_type is not null and internal_activity_type in ('team_walkthrough', 'studio_work'))
  or (activity_kind in ('task', 'review') and task_id is not null and internal_activity_type is null)
);

create or replace function private.save_daily_work_log(p_work_date date, p_entries jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_studio uuid;
  entry record;
  actor_admin boolean;
begin
  if actor is null or (select count(*) from public.studio_members sm join public.profiles p on p.id = sm.user_id
      where sm.user_id = actor and sm.is_active and p.is_active) <> 1 then
    raise exception 'An active studio membership is required';
  end if;
  select studio_id into actor_studio from public.studio_members where user_id = actor and is_active for update;
  actor_admin := coalesce(private.is_studio_admin(actor_studio), false);
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
  if exists(select 1 from jsonb_to_recordset(p_entries) as row(review_round_id uuid)
    where review_round_id is not null group by review_round_id having count(*)>1) then
    raise exception 'Work-log reviews must be unique'; end if;
  for entry in select * from jsonb_to_recordset(p_entries)
    as row(activity_kind text, task_id uuid, review_round_id uuid, correction_id uuid, internal_activity_type text, minutes integer) loop
    if entry.activity_kind = 'internal' then
      if not actor_admin then raise exception 'Only studio administrators can log internal work'; end if;
      if entry.internal_activity_type is null or entry.internal_activity_type not in ('team_walkthrough', 'studio_work') or entry.task_id is not null
        or entry.review_round_id is not null or entry.correction_id is not null then raise exception 'Choose a valid internal activity'; end if;
      continue;
    end if;
    if entry.activity_kind is null or entry.activity_kind not in ('task', 'review') or entry.task_id is null
      or entry.internal_activity_type is not null
      or (entry.activity_kind = 'review') <> (entry.review_round_id is not null) then
      raise exception 'Choose task work or a specific review round';
    end if;
    if entry.correction_id is not null and not exists(select 1 from public.task_corrections c
      where c.id=entry.correction_id and c.task_id=entry.task_id
        and (entry.activity_kind='review' or private.can_log_correction_work(c.id,actor,p_work_date))
        and p_work_date>=(c.created_at at time zone 'Europe/Kyiv')::date
        and (c.closed_at is null or p_work_date<=(c.closed_at at time zone 'Europe/Kyiv')::date)) then
      raise exception 'Correction time is unavailable for this person or date'; end if;
    if entry.activity_kind='review' and entry.correction_id is not null and not exists(
      select 1 from public.task_review_rounds r where r.id=entry.review_round_id and r.correction_id=entry.correction_id
    ) then raise exception 'Review time must belong to its correction'; end if;
    if entry.activity_kind='task' and entry.correction_id is null and exists(
      select 1 from public.task_corrections c join public.tasks t on t.id=c.task_id
      where c.task_id=entry.task_id and t.completed_at<p_work_date and private.can_log_correction_work(c.id,actor,p_work_date)
    ) then raise exception 'Choose the correction cycle for this work'; end if;
    -- Existing entries remain editable if project access changes after logging.
    if not exists (select 1 from public.work_log_entries w where w.studio_id = actor_studio and w.user_id = actor
        and w.work_date = p_work_date and w.task_id = entry.task_id and w.review_round_id is not distinct from entry.review_round_id and w.correction_id is not distinct from entry.correction_id)
      and (not exists (select 1 from public.tasks t join public.projects p on p.id = t.project_id
          where t.id = entry.task_id and p.studio_id = actor_studio and private.can_access_project(p.id))
        or (entry.activity_kind = 'review' and not exists (
          select 1 from public.task_review_round_reviewers rr join public.task_review_rounds r on r.id = rr.round_id
          where rr.round_id = entry.review_round_id and r.task_id = entry.task_id and rr.reviewer_id = actor
        ))) then raise exception 'Work-log activity is unavailable'; end if;
  end loop;
  if exists (select 1 from jsonb_to_recordset(p_entries) as row(activity_kind text, task_id uuid, review_round_id uuid, correction_id uuid, internal_activity_type text)
    group by activity_kind, task_id, review_round_id, correction_id, internal_activity_type having count(*) > 1) then
    raise exception 'Work-log activities must be unique'; end if;
  delete from public.work_log_entries w where w.studio_id = actor_studio and w.user_id = actor
    and w.work_date = p_work_date and (w.activity_kind <> 'internal' or actor_admin) and not exists (
      select 1 from jsonb_to_recordset(p_entries) as row(activity_kind text, task_id uuid, review_round_id uuid, correction_id uuid, internal_activity_type text)
      where row.activity_kind = w.activity_kind and row.task_id is not distinct from w.task_id
        and row.review_round_id is not distinct from w.review_round_id and row.correction_id is not distinct from w.correction_id
        and row.internal_activity_type is not distinct from w.internal_activity_type);
  for entry in select * from jsonb_to_recordset(p_entries)
    as row(activity_kind text, task_id uuid, review_round_id uuid, correction_id uuid, internal_activity_type text, minutes integer) loop
    if entry.activity_kind = 'internal' then
      insert into public.work_log_entries(studio_id, user_id, work_date, activity_kind, internal_activity_type, minutes)
      values (actor_studio, actor, p_work_date, 'internal', entry.internal_activity_type, entry.minutes)
      on conflict (user_id, work_date, internal_activity_type) where activity_kind = 'internal'
      do update set minutes = excluded.minutes, updated_at = clock_timestamp();
    elsif entry.activity_kind = 'task' then
      insert into public.work_log_entries(studio_id, user_id, work_date, activity_kind, task_id, correction_id, minutes)
      values (actor_studio, actor, p_work_date, 'task', entry.task_id, entry.correction_id, entry.minutes)
      on conflict (user_id, work_date, task_id, correction_id) where activity_kind = 'task'
      do update set minutes = excluded.minutes, updated_at = clock_timestamp();
    else
      insert into public.work_log_entries(studio_id, user_id, work_date, activity_kind, task_id, review_round_id, minutes)
      values (actor_studio, actor, p_work_date, 'review', entry.task_id, entry.review_round_id, entry.minutes)
      on conflict (user_id, work_date, task_id, review_round_id)
      do update set minutes = excluded.minutes, updated_at = clock_timestamp();
    end if;
  end loop;
  insert into public.work_log_days(studio_id, user_id, work_date, submitted_at)
  values (actor_studio, actor, p_work_date, clock_timestamp())
  on conflict (studio_id, user_id, work_date) do update set submitted_at = excluded.submitted_at;
end;
$$;
revoke all on function private.save_daily_work_log(date,jsonb) from public,anon,authenticated;

