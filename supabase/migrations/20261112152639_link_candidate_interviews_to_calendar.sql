begin;

alter table public.calendar_events
  add column recruiting_cycle_id uuid,
  add constraint calendar_events_recruiting_cycle_studio_fkey
    foreign key (recruiting_cycle_id, studio_id)
    references public.crm_recruiting_cycles(id, studio_id) on delete cascade,
  add constraint calendar_events_candidate_interview_check
    check (recruiting_cycle_id is null or event_type = 'interview');

create index calendar_events_recruiting_cycle_idx
  on public.calendar_events(recruiting_cycle_id) where recruiting_cycle_id is not null;
create unique index calendar_events_one_live_candidate_interview_idx
  on public.calendar_events(recruiting_cycle_id)
  where recruiting_cycle_id is not null and cancelled_at is null;
grant insert (recruiting_cycle_id), update (recruiting_cycle_id) on public.calendar_events to authenticated;

create function private.validate_calendar_candidate_interview()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.recruiting_cycle_id is not null
    and not private.is_active_crm_admin(old.studio_id) then raise exception 'admin_required'; end if;
  if tg_op = 'UPDATE' and new.cancelled_at is not null
    and new.recruiting_cycle_id is distinct from old.recruiting_cycle_id then
    raise exception 'Cancelling an event cannot change its candidate';
  end if;
  if new.recruiting_cycle_id is not null then
    if not private.is_active_crm_admin(new.studio_id) then raise exception 'admin_required'; end if;
    perform 1 from public.crm_recruiting_cycles
      where id = new.recruiting_cycle_id and studio_id = new.studio_id for update;
    if not found then raise exception 'interview_candidate_unavailable'; end if;
  end if;
  return new;
end;
$$;

create trigger validate_calendar_candidate_interview_before_write
before insert or update on public.calendar_events
for each row execute function private.validate_calendar_candidate_interview();

-- The distinct checks stop recursion: either surface changes the same canonical instant.
create function private.sync_calendar_candidate_interview()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' and old.recruiting_cycle_id is not null then
    if tg_op = 'DELETE' or new.cancelled_at is not null
      or new.recruiting_cycle_id is distinct from old.recruiting_cycle_id then
      update public.crm_recruiting_cycles set interview_at = null
        where id = old.recruiting_cycle_id and studio_id = old.studio_id
          and interview_at = old.starts_at;
    end if;
  end if;
  if tg_op <> 'DELETE' and new.cancelled_at is null and new.recruiting_cycle_id is not null then
    update public.crm_recruiting_cycles set interview_at = new.starts_at
      where id = new.recruiting_cycle_id and studio_id = new.studio_id
        and interview_at is distinct from new.starts_at;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger sync_calendar_candidate_interview_after_write
  after insert or update or delete on public.calendar_events
  for each row execute function private.sync_calendar_candidate_interview();

create function private.sync_crm_candidate_interview()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.interview_at is not distinct from old.interview_at then return new; end if;
  if new.interview_at is null then
    update public.calendar_events set cancelled_at = now()
      where recruiting_cycle_id = new.id and studio_id = new.studio_id and cancelled_at is null;
  else
    update public.calendar_events
      set ends_at = new.interview_at + (ends_at - starts_at), starts_at = new.interview_at
      where recruiting_cycle_id = new.id and studio_id = new.studio_id
        and cancelled_at is null and starts_at is distinct from new.interview_at;
  end if;
  return new;
end;
$$;

create trigger sync_crm_candidate_interview_after_write
  after update of interview_at on public.crm_recruiting_cycles
  for each row execute function private.sync_crm_candidate_interview();

revoke all on function private.validate_calendar_candidate_interview() from public, anon, authenticated;
revoke all on function private.sync_calendar_candidate_interview() from public, anon, authenticated;
revoke all on function private.sync_crm_candidate_interview() from public, anon, authenticated;

drop function public.create_calendar_event_with_invites(uuid, text, public.calendar_event_type, timestamptz, timestamptz, boolean, uuid, text, text, text, uuid[], jsonb, uuid, uuid, uuid[], text);

create function public.create_calendar_event_with_invites(
  p_studio_id uuid,
  p_title text,
  p_event_type public.calendar_event_type,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_all_day boolean,
  p_project_id uuid default null,
  p_description text default null,
  p_location text default null,
  p_meeting_url text default null,
  p_attendee_ids uuid[] default '{}'::uuid[],
  p_recurrence_rule jsonb default null,
  p_compensates_time_off_request_id uuid default null,
  p_assignee_id uuid default null,
  p_participant_ids uuid[] default '{}'::uuid[],
  p_meeting_mode text default null,
  p_recruiting_cycle_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_event_id uuid; participant_id uuid;
begin
  -- Older callers can still send a single visit assignee. Store it in the same relation.
  if p_event_type = 'site_visit' then
    if coalesce(cardinality(p_participant_ids), 0) = 0 and p_assignee_id is not null then p_participant_ids := array[p_assignee_id]; end if;
    p_assignee_id := null;
  end if;
  if p_event_type in ('business_trip', 'site_visit') then
    if not private.is_studio_admin(p_studio_id) then p_participant_ids := array[(select auth.uid())]; end if;
    perform public.validate_business_trip_participants(p_studio_id, p_project_id, p_participant_ids);
  end if;
  insert into public.calendar_events (studio_id, project_id, title, description, event_type, starts_at, ends_at, all_day, location, meeting_url, meeting_mode, recurrence_rule, compensates_time_off_request_id, assignee_id, recruiting_cycle_id, created_by, organizer_id)
  values (p_studio_id, p_project_id, p_title, p_description, p_event_type, p_starts_at, p_ends_at, p_all_day, p_location, p_meeting_url, case when p_event_type in ('meeting', 'presentation') then coalesce(p_meeting_mode, 'offline') else null end, p_recurrence_rule, p_compensates_time_off_request_id, p_assignee_id, p_recruiting_cycle_id, (select auth.uid()), (select auth.uid()))
  returning id into new_event_id;
  if p_event_type in ('business_trip', 'site_visit') then
    foreach participant_id in array coalesce(p_participant_ids, '{}'::uuid[]) loop
      insert into public.calendar_event_participants (event_id, user_id, assigned_by) values (new_event_id, participant_id, (select auth.uid())) on conflict do nothing;
    end loop;
  elsif p_event_type not in ('site_visit', 'interview') then
    insert into public.calendar_event_invites (event_id, user_id, status, invited_by)
    select new_event_id, attendee_id, 'pending'::public.calendar_event_invitation_status, (select auth.uid())
    from (select distinct attendee_id from unnest(coalesce(p_attendee_ids, '{}'::uuid[])) as attendee_id) as invitees
    where p_event_type in ('general', 'meeting', 'presentation') or attendee_id <> (select auth.uid());
  end if;
  return new_event_id;
end;
$$;

revoke execute on function public.create_calendar_event_with_invites(uuid, text, public.calendar_event_type, timestamptz, timestamptz, boolean, uuid, text, text, text, uuid[], jsonb, uuid, uuid, uuid[], text, uuid) from public, anon;
grant execute on function public.create_calendar_event_with_invites(uuid, text, public.calendar_event_type, timestamptz, timestamptz, boolean, uuid, text, text, text, uuid[], jsonb, uuid, uuid, uuid[], text, uuid) to authenticated;


commit;
