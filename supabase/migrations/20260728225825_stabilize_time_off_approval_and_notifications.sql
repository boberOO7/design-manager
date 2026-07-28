-- Canonical time-off transition table:
-- employee: pending -> cancelled
-- admin:    pending -> approved | rejected | cancelled
-- admin:    approved | rejected -> cancelled
-- cancelled requests are terminal. Request details and ownership are immutable
-- after insert; reviewer fields are set only for approval/rejection.
create or replace function private.validate_time_off_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_is_admin boolean;
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.studio_members as membership
      inner join public.profiles as profile on profile.id = membership.user_id
      where membership.studio_id = new.studio_id
        and membership.user_id = new.user_id
        and membership.is_active = true
        and profile.is_active = true
    ) then
      raise exception 'Time-off user must be an active studio member';
    end if;

    if new.user_id is distinct from actor_id then
      raise exception 'Time-off requests must belong to the authenticated user';
    end if;

    actor_is_admin := coalesce(private.is_studio_admin(new.studio_id), false);
    if actor_is_admin then
      if new.status <> 'approved'
        or new.reviewed_by is distinct from actor_id
        or new.reviewed_at is null
        or new.review_note is not null
        or new.cancelled_at is not null then
        raise exception 'Administrator time-off requests must be approved by their creator';
      end if;
    elsif new.status <> 'pending'
      or new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.review_note is not null
      or new.cancelled_at is not null then
      raise exception 'Employee time-off requests must start pending and unreviewed';
    end if;

    return new;
  end if;

  if new.studio_id is distinct from old.studio_id
    or new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Time-off ownership fields cannot be changed';
  end if;

  if new.request_type is distinct from old.request_type
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or new.all_day is distinct from old.all_day
    or new.private_note is distinct from old.private_note then
    raise exception 'Time-off request details cannot be changed after submission';
  end if;

  if old.status = 'cancelled' then
    raise exception 'Cancelled time-off requests are read-only';
  end if;

  actor_is_admin := exists (
    select 1
    from public.studio_members as membership
    inner join public.profiles as profile on profile.id = membership.user_id
    where membership.studio_id = new.studio_id
      and membership.user_id = actor_id
      and membership.system_role = 'admin'
      and membership.is_active = true
      and profile.is_active = true
  );

  if old.status in ('approved', 'rejected') then
    if not actor_is_admin or new.status <> 'cancelled' then
      raise exception 'Only administrators may cancel reviewed time-off requests';
    end if;

    if new.cancelled_at is null
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note then
      raise exception 'Cancelling a reviewed request must preserve review details';
    end if;

    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'Unsupported time-off status transition';
  end if;

  if not actor_is_admin then
    if old.user_id is distinct from actor_id
      or new.status <> 'cancelled'
      or new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.review_note is not null
      or new.cancelled_at is null then
      raise exception 'Employees may only cancel their own pending request';
    end if;

    return new;
  end if;

  if new.status in ('approved', 'rejected') then
    if new.reviewed_by is distinct from actor_id
      or new.reviewed_at is null
      or new.cancelled_at is not null then
      raise exception 'Reviewed requests require the active administrator and review time';
    end if;
  elsif new.status = 'cancelled' then
    if new.reviewed_by is not null
      or new.reviewed_at is not null
      or new.review_note is not null
      or new.cancelled_at is null then
      raise exception 'Cancelling a pending request cannot set review details';
    end if;
  else
    raise exception 'Unsupported time-off status transition';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_time_off_request()
from public, anon, authenticated;

create or replace function private.notify_time_off_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  recipient uuid;
  notification_kind public.notification_type;
  request_label text := initcap(replace(new.request_type::text, '_', ' '));
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    actor := (select auth.uid());
    for recipient in
      select distinct member.user_id
      from public.studio_members as member
      inner join public.profiles as profile on profile.id = member.user_id
      where member.studio_id = new.studio_id
        and member.is_active = true
        and profile.is_active = true
        and member.system_role = 'admin'
    loop
      perform private.create_notification(
        'time_off_request_submitted',
        new.studio_id,
        recipient,
        actor,
        'New time-off request',
        (select profile.full_name from public.profiles as profile where profile.id = new.user_id)
          || ' requested ' || request_label || ' for ' || to_char(new.start_date, 'Mon FMDD')
          || case when new.end_date <> new.start_date then '–' || to_char(new.end_date, 'Mon FMDD') else '' end || '.',
        '/admin?request=' || new.id,
        'time_off_request',
        new.id,
        '{}'::jsonb
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    actor := new.reviewed_by;
    notification_kind := case
      when new.status = 'approved' then 'time_off_request_approved'::public.notification_type
      else 'time_off_request_rejected'::public.notification_type
    end;

    perform private.create_notification(
      notification_kind,
      new.studio_id,
      new.user_id,
      actor,
      case when new.status = 'approved' then 'Time off approved' else 'Time off rejected' end,
      request_label || ' request for ' || to_char(new.start_date, 'Mon FMDD')
        || case when new.end_date <> new.start_date then '–' || to_char(new.end_date, 'Mon FMDD') else '' end || '.',
      '/calendar?request=' || new.id || '&date=' || new.start_date,
      'time_off_request',
      new.id,
      '{}'::jsonb
    );
  elsif tg_op = 'UPDATE'
    and old.status in ('pending', 'approved', 'rejected')
    and new.status = 'cancelled' then
    actor := (select auth.uid());
    perform private.create_notification(
      'time_off_request_cancelled',
      new.studio_id,
      new.user_id,
      actor,
      'Time off cancelled',
      request_label || ' request for ' || to_char(new.start_date, 'Mon FMDD') || ' was cancelled.',
      '/calendar?request=' || new.id || '&date=' || new.start_date,
      'time_off_request',
      new.id,
      '{}'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.notify_time_off_request()
from public, anon, authenticated;
