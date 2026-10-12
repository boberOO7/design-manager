-- Internal work shares daily submission semantics, but has no task/project identity.
alter table public.work_log_entries alter column task_id drop not null;
alter table public.work_log_entries add column internal_activity_type text;
alter table public.work_log_entries drop constraint work_log_entries_activity_kind_check;
alter table public.work_log_entries add constraint work_log_entries_activity_kind_check
  check (activity_kind in ('task', 'review', 'internal'));
alter table public.work_log_entries add constraint work_log_entries_internal_activity_check check (
  (activity_kind = 'internal' and task_id is null and review_round_id is null
    and internal_activity_type is not null and internal_activity_type in ('team_walkthrough'))
  or (activity_kind in ('task', 'review') and task_id is not null and internal_activity_type is null)
);
-- Keep the review timer's existing conflict target. Separate nullable identities
-- allow additional internal types without changing timer accounting.
alter table public.work_log_entries drop constraint work_log_entries_user_id_work_date_task_id_review_round_id_key;
alter table public.work_log_entries add constraint work_log_entries_user_id_work_date_task_id_review_round_id_key
  unique (user_id, work_date, task_id, review_round_id);
create unique index work_log_entries_task_day_key on public.work_log_entries(user_id, work_date, task_id)
  where activity_kind = 'task';
create unique index work_log_entries_internal_day_key on public.work_log_entries(user_id, work_date, internal_activity_type)
  where activity_kind = 'internal';
create policy work_log_internal_admin_read on public.work_log_entries as restrictive for select to authenticated
  using (activity_kind <> 'internal' or (select private.is_studio_admin(studio_id)));
-- Direct writes remain revoked; the guarded daily RPC is the only write API.

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
  for entry in select * from jsonb_to_recordset(p_entries)
    as row(activity_kind text, task_id uuid, review_round_id uuid, internal_activity_type text, minutes integer) loop
    if entry.activity_kind = 'internal' then
      if not actor_admin then raise exception 'Only studio administrators can log internal work'; end if;
      if entry.internal_activity_type is distinct from 'team_walkthrough' or entry.task_id is not null
        or entry.review_round_id is not null then raise exception 'Choose a valid internal activity'; end if;
      continue;
    end if;
    if entry.activity_kind is null or entry.activity_kind not in ('task', 'review') or entry.task_id is null
      or entry.internal_activity_type is not null
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
  if exists (select 1 from jsonb_to_recordset(p_entries) as row(activity_kind text, task_id uuid, review_round_id uuid, internal_activity_type text)
    group by activity_kind, task_id, review_round_id, internal_activity_type having count(*) > 1) then
    raise exception 'Work-log activities must be unique'; end if;
  delete from public.work_log_entries w where w.studio_id = actor_studio and w.user_id = actor
    and w.work_date = p_work_date and (w.activity_kind <> 'internal' or actor_admin) and not exists (
      select 1 from jsonb_to_recordset(p_entries) as row(activity_kind text, task_id uuid, review_round_id uuid, internal_activity_type text)
      where row.activity_kind = w.activity_kind and row.task_id is not distinct from w.task_id
        and row.review_round_id is not distinct from w.review_round_id
        and row.internal_activity_type is not distinct from w.internal_activity_type);
  for entry in select * from jsonb_to_recordset(p_entries)
    as row(activity_kind text, task_id uuid, review_round_id uuid, internal_activity_type text, minutes integer) loop
    if entry.activity_kind = 'internal' then
      insert into public.work_log_entries(studio_id, user_id, work_date, activity_kind, internal_activity_type, minutes)
      values (actor_studio, actor, p_work_date, 'internal', entry.internal_activity_type, entry.minutes)
      on conflict (user_id, work_date, internal_activity_type) where activity_kind = 'internal'
      do update set minutes = excluded.minutes, updated_at = clock_timestamp();
    elsif entry.activity_kind = 'task' then
      insert into public.work_log_entries(studio_id, user_id, work_date, activity_kind, task_id, minutes)
      values (actor_studio, actor, p_work_date, 'task', entry.task_id, entry.minutes)
      on conflict (user_id, work_date, task_id) where activity_kind = 'task'
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

create or replace function public.save_daily_work_log(p_work_date date,p_entries jsonb,p_timer_snapshot jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  merged jsonb;
begin
  if actor is null then raise exception 'An active studio membership is required'; end if;
  perform 1 from public.studio_members where user_id=actor and is_active for update;
  perform private.review_timer_lock(actor);
  perform public.control_review_timer('sync');
  if p_timer_snapshot is null then
    if exists(select 1 from public.review_timer_daily where user_id=actor and work_date=p_work_date and minutes>0) then
      raise exception 'Refresh the Work Log before editing timer-tracked time';
    end if;
    perform private.save_daily_work_log(p_work_date,p_entries);
    return;
  end if;
  if jsonb_typeof(p_timer_snapshot)<>'object' or p_entries is null or jsonb_typeof(p_entries)<>'array' then
    raise exception 'Enter valid Work Log entries and timer snapshot'; end if;
  if exists(select 1 from jsonb_each(p_timer_snapshot) snap where
    jsonb_typeof(snap.value)<>'number' or (snap.value::text)::numeric<0 or (snap.value::text)::numeric<>trunc((snap.value::text)::numeric)
    or (snap.value::text)::numeric>coalesce((select d.minutes from public.review_timer_daily d where d.user_id=actor and d.work_date=p_work_date and d.round_id=snap.key::uuid),0)) then
    raise exception 'Invalid timer snapshot'; end if;
  -- Validate the submitted payload before merging; no duplicate/invalid rows disappear.
  if exists(select 1 from jsonb_array_elements(p_entries) item where jsonb_typeof(item)<>'object'
      or jsonb_typeof(item->'minutes') is distinct from 'number' or (item->>'minutes')::numeric<=0
      or (item->>'minutes')::numeric<>trunc((item->>'minutes')::numeric))
    or exists(select 1 from jsonb_to_recordset(p_entries) as row(activity_kind text,task_id uuid,review_round_id uuid,internal_activity_type text)
      group by activity_kind,task_id,review_round_id,internal_activity_type having count(*)>1) then raise exception 'Enter unique activities and positive whole minutes'; end if;
  with supplied as (
    select * from jsonb_to_recordset(p_entries) as row(activity_kind text,task_id uuid,review_round_id uuid,internal_activity_type text,minutes integer)
  ), adjusted as (
    select e.activity_kind,e.task_id,e.review_round_id,e.internal_activity_type,e.minutes + coalesce(d.minutes,0) - coalesce((p_timer_snapshot->>e.review_round_id::text)::integer,0) as minutes
    from supplied e left join public.review_timer_daily d on d.user_id=actor and d.work_date=p_work_date and d.round_id=e.review_round_id
    union all
    select 'review',r.task_id,d.round_id,null::text,d.minutes-coalesce((p_timer_snapshot->>d.round_id::text)::integer,0)
    from public.review_timer_daily d join public.task_review_rounds r on r.id=d.round_id
    where d.user_id=actor and d.work_date=p_work_date and not exists(select 1 from supplied e where e.review_round_id=d.round_id)
      and d.minutes>coalesce((p_timer_snapshot->>d.round_id::text)::integer,0)
  ) select coalesce(jsonb_agg(to_jsonb(adjusted)),'[]'::jsonb) into merged from adjusted;
  perform private.save_daily_work_log(p_work_date,merged);
end;
$$;
revoke all on function public.save_daily_work_log(date,jsonb,jsonb) from public,anon;
grant execute on function public.save_daily_work_log(date,jsonb,jsonb) to authenticated;

create or replace function public.get_work_log_timer_snapshot(p_work_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); studio uuid; synced jsonb; entries jsonb; snapshot jsonb;
begin
  synced:=public.sync_review_timer();
  select studio_id into studio from public.studio_members where user_id=actor and is_active;
  select coalesce(jsonb_agg(jsonb_build_object('activity_kind',activity_kind,'task_id',task_id,'review_round_id',review_round_id,'minutes',minutes,'internal_activity_type',internal_activity_type)),'[]'::jsonb)
    into entries from public.work_log_entries where user_id=actor and studio_id=studio and work_date=p_work_date and (activity_kind <> 'internal' or private.is_studio_admin(studio));
  select coalesce(jsonb_object_agg(round_id::text,minutes),'{}'::jsonb) into snapshot
    from public.review_timer_daily where user_id=actor and studio_id=studio and work_date=p_work_date;
  return jsonb_build_object('entries',entries,'timerSnapshot',snapshot,'changed',synced->'changed','studioId',synced->'studioId');
end;
$$;
revoke all on function public.get_work_log_timer_snapshot(date) from public,anon;
grant execute on function public.get_work_log_timer_snapshot(date) to authenticated;

notify pgrst, 'reload schema';
