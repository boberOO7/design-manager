-- Maintenance ownership is independent of workstation assignment.
alter table public.equipment
  add column maintenance_responsible_id uuid,
  add constraint equipment_maintenance_responsible_studio_fkey
    foreign key (studio_id, maintenance_responsible_id)
    references public.studio_members(studio_id, user_id)
    on delete set null (maintenance_responsible_id);
create index equipment_maintenance_responsible_idx
  on public.equipment(studio_id, maintenance_responsible_id)
  where maintenance_responsible_id is not null;
grant update (maintenance_responsible_id) on public.equipment to authenticated;

create function private.enforce_equipment_maintenance_responsible()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.maintenance_responsible_id is not null and not exists (
    select 1 from public.studio_members m
    join public.profiles p on p.id = m.user_id and p.is_active
    where m.studio_id = new.studio_id and m.user_id = new.maintenance_responsible_id
      and m.is_active and m.system_role = 'admin'
  ) then
    raise exception 'maintenance_responsible_must_be_an_active_studio_admin' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_equipment_maintenance_responsible() from public, anon, authenticated, service_role;
create trigger enforce_equipment_maintenance_responsible_before_write
before insert or update of maintenance_responsible_id on public.equipment
for each row execute function private.enforce_equipment_maintenance_responsible();

create or replace function private.reset_equipment_maintenance_notification_cycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.recurring_maintenance_enabled is distinct from old.recurring_maintenance_enabled
    or new.next_maintenance_due_date is distinct from old.next_maintenance_due_date
    or new.maintenance_responsible_id is distinct from old.maintenance_responsible_id
    or (new.lifecycle_state = 'retired') is distinct from (old.lifecycle_state = 'retired') then
    new.maintenance_upcoming_notified_for := null;
    new.maintenance_overdue_notified_for := null;
    -- Deletion also cancels queued/retrying pushes through their existing FK.
    delete from public.notifications
    where entity_type = 'equipment' and entity_id = new.id and read_at is null
      and notification_type in ('equipment_maintenance_upcoming', 'equipment_maintenance_overdue');
  end if;
  return new;
end;
$$;

-- Also close the old cycle when a backdated completion produces the same due date.
create function private.cancel_completed_equipment_maintenance_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event_type = 'regular_maintenance' and old.completed_on is null and new.completed_on is not null then
    delete from public.notifications
    where entity_type = 'equipment' and entity_id = new.equipment_id and read_at is null
      and notification_type in ('equipment_maintenance_upcoming', 'equipment_maintenance_overdue');
    update public.equipment
    set maintenance_upcoming_notified_for = null, maintenance_overdue_notified_for = null
    where id = new.equipment_id;
  end if;
  return new;
end;
$$;
revoke all on function private.cancel_completed_equipment_maintenance_reminders() from public, anon, authenticated, service_role;
create trigger cancel_completed_equipment_maintenance_reminders_after_update
after update of completed_on on public.equipment_service_events
for each row execute function private.cancel_completed_equipment_maintenance_reminders();

-- Shared by queue claims and the final server/browser delivery checks.
create function private.notification_reminder_is_current(p_notification public.notifications)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_notification.notification_type in ('equipment_maintenance_upcoming', 'equipment_maintenance_overdue') then exists (
      select 1 from public.equipment e
      join public.studio_members m on m.studio_id = e.studio_id and m.user_id = p_notification.recipient_id
      join public.profiles p on p.id = m.user_id and p.is_active
      where p_notification.entity_type = 'equipment' and e.id = p_notification.entity_id
        and e.studio_id = p_notification.studio_id and e.recurring_maintenance_enabled
        and e.lifecycle_state <> 'retired'
        and e.next_maintenance_due_date::text = p_notification.metadata->>'dueDate'
        and m.is_active and m.system_role = 'admin'
        and (e.maintenance_responsible_id is null or e.maintenance_responsible_id = m.user_id)
        and not exists (
          select 1 from public.equipment_service_events s
          where s.equipment_id = e.id and s.event_type = 'regular_maintenance'
            and s.completed_on is not null and s.updated_at > p_notification.created_at
        )
    )
    when p_notification.notification_type = 'crm_lead_follow_up' then exists (
      select 1 from public.crm_leads l
      where p_notification.entity_type = 'crm_lead' and l.id = p_notification.entity_id
        and l.studio_id = p_notification.studio_id and l.status <> 'invalid'
        and l.responsible_admin_id = p_notification.recipient_id
        and l.next_contact_at = (p_notification.metadata->>'contactAt')::timestamptz
    )
    else true
  end;
$$;
revoke all on function private.notification_reminder_is_current(public.notifications) from public, anon, authenticated, service_role;

create function public.is_notification_deliverable(p_notification_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.notifications n
    join public.studio_members m on m.studio_id = n.studio_id and m.user_id = n.recipient_id and m.is_active
    join public.profiles p on p.id = m.user_id and p.is_active
    where n.id = p_notification_id and n.read_at is null and n.created_at <= now()
      and (n.recipient_id = (select auth.uid()) or current_setting('role', true) = 'service_role')
      and private.notification_reminder_is_current(n)
  );
$$;
revoke all on function public.is_notification_deliverable(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_notification_deliverable(uuid) to authenticated, service_role;

-- Reconcile already queued stale reminders when this migration is applied.
delete from public.notifications n
where n.read_at is null
  and n.notification_type in ('equipment_maintenance_upcoming', 'equipment_maintenance_overdue')
  and not private.notification_reminder_is_current(n);

create or replace function private.enqueue_web_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.web_push_deliveries(notification_id, subscription_id, next_attempt_at)
  select new.id, s.id, greatest(now(), new.created_at) from public.web_push_subscriptions s
  join auth.sessions a on a.id = s.session_id and a.user_id = s.user_id
  join public.profiles p on p.id = s.user_id and p.is_active
  join public.studio_members m on m.user_id = s.user_id and m.studio_id = new.studio_id and m.is_active
  where s.user_id = new.recipient_id and new.read_at is null
    and (a.not_after is null or a.not_after > now())
  on conflict (notification_id, subscription_id) do nothing;
  return new;
end;
$$;

update public.web_push_deliveries d set next_attempt_at = n.created_at
from public.notifications n
where d.notification_id = n.id and d.completed_at is null and d.next_attempt_at < n.created_at;

create or replace function public.claim_web_push_deliveries(p_limit integer default 20)
returns table(id uuid, notification_id uuid, subscription_id uuid, user_id uuid,
  endpoint text, p256dh text, auth text, vapid_public_key text, locale text, attempts integer, lease_token uuid)
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.web_push_subscriptions s where not exists (
    select 1 from auth.sessions a join public.profiles p on p.id = a.user_id and p.is_active
    where a.id = s.session_id and a.user_id = s.user_id and (a.not_after is null or a.not_after > now())
  );
  update public.web_push_deliveries d set completed_at = now(), lease_token = null
  where d.completed_at is null and not exists (
    select 1 from public.notifications n join public.web_push_subscriptions s on s.id = d.subscription_id
    join public.studio_members m on m.studio_id = n.studio_id and m.user_id = s.user_id and m.is_active
    where n.id = d.notification_id and n.recipient_id = s.user_id and n.read_at is null
      and private.notification_reminder_is_current(n)
  );
  return query
  with pending as (
    select d.id from public.web_push_deliveries d
    join public.notifications n on n.id = d.notification_id
    where d.completed_at is null and d.next_attempt_at <= now() and n.created_at <= now()
    order by d.next_attempt_at, d.id limit greatest(1, least(p_limit, 100)) for update of d skip locked
  ), claimed as (
    update public.web_push_deliveries d set attempts = d.attempts + 1,
      next_attempt_at = now() + interval '5 minutes', lease_token = gen_random_uuid()
    from pending where d.id = pending.id returning d.*
  )
  select c.id, c.notification_id, s.id, s.user_id, s.endpoint, s.p256dh, s.auth,
    s.vapid_public_key, s.locale, c.attempts, c.lease_token
  from claimed c join public.web_push_subscriptions s on s.id = c.subscription_id;
end;
$$;

create or replace function public.generate_equipment_maintenance_notifications(
  p_today date default (now() at time zone 'Europe/Kyiv')::date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  recipient uuid;
  notification_kind public.notification_type;
  equipment_label text;
  generated_count integer := 0;
  previous_count integer;
begin
  if p_today is null then raise exception 'notification_date_required'; end if;

  for target in
    select equipment.*
    from public.equipment as equipment
    where equipment.recurring_maintenance_enabled
      and equipment.lifecycle_state <> 'retired'
      and equipment.next_maintenance_due_date <= p_today + 30
      and (
        (
          equipment.next_maintenance_due_date < p_today
          and equipment.maintenance_overdue_notified_for is distinct from equipment.next_maintenance_due_date
        )
        or (
          equipment.next_maintenance_due_date >= p_today
          and equipment.maintenance_upcoming_notified_for is distinct from equipment.next_maintenance_due_date
        )
      )
    order by equipment.next_maintenance_due_date, equipment.id
    for update skip locked
  loop
    notification_kind := case
      when target.next_maintenance_due_date < p_today
      then 'equipment_maintenance_overdue'::public.notification_type
      else 'equipment_maintenance_upcoming'::public.notification_type
    end;
    equipment_label := coalesce(target.display_name, target.asset_tag);

    -- A threshold escalation replaces the older unread upcoming reminder.
    if notification_kind = 'equipment_maintenance_overdue' then
      delete from public.notifications
      where entity_type = 'equipment' and entity_id = target.id and read_at is null
        and notification_type = 'equipment_maintenance_upcoming';
    end if;

    previous_count := generated_count;
    for recipient in
      select member.user_id
      from public.studio_members as member
      inner join public.profiles as profile on profile.id = member.user_id
      where member.studio_id = target.studio_id
        and member.system_role = 'admin'
        and (target.maintenance_responsible_id is null or member.user_id = target.maintenance_responsible_id)
        and member.is_active
        and profile.is_active
    loop
      perform private.create_notification(
        notification_kind,
        target.studio_id,
        recipient,
        null,
        case
          when notification_kind = 'equipment_maintenance_overdue'
          then 'Equipment maintenance overdue'
          else 'Equipment maintenance due soon'
        end,
        equipment_label || ' is due for maintenance on ' || target.next_maintenance_due_date || '.',
        '/office/equipment?view=maintenance&item=' || target.id,
        'equipment',
        target.id,
        jsonb_build_object(
          'equipmentName', equipment_label,
          'dueDate', target.next_maintenance_due_date,
          'threshold', case
            when notification_kind = 'equipment_maintenance_overdue' then 'overdue'
            else 'upcoming'
          end
        )
      );
      generated_count := generated_count + 1;
    end loop;

    if generated_count = previous_count then continue; end if;

    update public.equipment
    set
      maintenance_upcoming_notified_for = case
        when notification_kind = 'equipment_maintenance_upcoming'
        then target.next_maintenance_due_date
        else maintenance_upcoming_notified_for
      end,
      maintenance_overdue_notified_for = case
        when notification_kind = 'equipment_maintenance_overdue'
        then target.next_maintenance_due_date
        else maintenance_overdue_notified_for
      end
    where id = target.id;
  end loop;

  return generated_count;
end;
$$;

revoke execute on function public.generate_equipment_maintenance_notifications(date)
from public, anon, authenticated;
grant execute on function public.generate_equipment_maintenance_notifications(date)
to service_role;

notify pgrst, 'reload schema';
