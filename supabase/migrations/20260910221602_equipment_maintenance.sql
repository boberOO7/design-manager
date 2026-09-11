alter type public.notification_type add value if not exists 'equipment_maintenance_upcoming';
alter type public.notification_type add value if not exists 'equipment_maintenance_overdue';

create type public.equipment_service_event_type as enum (
  'regular_maintenance',
  'repair',
  'upgrade'
);

alter table public.equipment
  add column recurring_maintenance_enabled boolean not null default false,
  add column maintenance_interval_months integer,
  add column next_maintenance_due_date date,
  add column maintenance_upcoming_notified_for date,
  add column maintenance_overdue_notified_for date,
  add constraint equipment_maintenance_schedule_check check (
    (
      recurring_maintenance_enabled
      and maintenance_interval_months between 1 and 120
      and next_maintenance_due_date is not null
    )
    or (
      not recurring_maintenance_enabled
      and maintenance_interval_months is null
      and next_maintenance_due_date is null
    )
  );

create index equipment_maintenance_queue_idx
  on public.equipment (next_maintenance_due_date, lifecycle_state)
  where recurring_maintenance_enabled and lifecycle_state <> 'retired';

create table public.equipment_service_events (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  equipment_id uuid not null,
  event_type public.equipment_service_event_type not null,
  started_on date not null,
  completed_on date,
  service_provider text check (
    service_provider is null
    or (service_provider = btrim(service_provider) and char_length(service_provider) between 1 and 160)
  ),
  cost_amount numeric(12, 2),
  cost_currency text,
  started_notes text check (started_notes is null or char_length(started_notes) <= 5000),
  completion_notes text check (completion_notes is null or char_length(completion_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_service_events_equipment_studio_fkey
    foreign key (studio_id, equipment_id)
    references public.equipment(studio_id, id)
    on delete restrict,
  constraint equipment_service_events_dates_check check (
    completed_on is null or completed_on >= started_on
  ),
  constraint equipment_service_events_cost_check check (
    (cost_amount is null and cost_currency is null)
    or (
      cost_amount > 0
      and cost_currency in ('UAH', 'USD', 'EUR', 'PLN')
    )
  ),
  constraint equipment_service_events_open_shape_check check (
    completed_on is not null
    or (cost_amount is null and cost_currency is null and completion_notes is null)
  )
);

create index equipment_service_events_equipment_history_idx
  on public.equipment_service_events (equipment_id, completed_on desc, started_on desc, id desc);
create index equipment_service_events_studio_idx
  on public.equipment_service_events (studio_id);
create unique index equipment_service_events_one_open_idx
  on public.equipment_service_events (equipment_id)
  where completed_on is null;

create trigger set_equipment_service_events_updated_at
  before update on public.equipment_service_events
  for each row execute function public.set_updated_at();

alter table public.equipment_service_events enable row level security;
revoke all on table public.equipment_service_events from public, anon, authenticated, service_role;
grant select on table public.equipment_service_events to authenticated;

create policy equipment_service_events_select_admin
on public.equipment_service_events for select to authenticated
using ((select private.is_studio_admin(studio_id)));

create or replace function private.reset_equipment_maintenance_notification_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recurring_maintenance_enabled is distinct from old.recurring_maintenance_enabled
    or new.next_maintenance_due_date is distinct from old.next_maintenance_due_date then
    new.maintenance_upcoming_notified_for := null;
    new.maintenance_overdue_notified_for := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.reset_equipment_maintenance_notification_cycle()
from public, anon, authenticated, service_role;

create trigger reset_equipment_maintenance_notification_cycle_before_update
before update on public.equipment
for each row execute function private.reset_equipment_maintenance_notification_cycle();

create or replace function private.enforce_equipment_service_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lifecycle_state = 'in_service'
    and (tg_op = 'INSERT' or old.lifecycle_state <> 'in_service')
    and not exists (
      select 1
      from public.equipment_service_events as service
      where service.equipment_id = new.id
        and service.completed_on is null
    ) then
    raise exception 'equipment_service_event_required';
  end if;

  if tg_op = 'UPDATE'
    and old.lifecycle_state = 'in_service'
    and new.lifecycle_state <> 'in_service'
    and exists (
      select 1
      from public.equipment_service_events as service
      where service.equipment_id = new.id
        and service.completed_on is null
    ) then
    raise exception 'equipment_service_must_be_completed';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_equipment_service_lifecycle()
from public, anon, authenticated, service_role;

create trigger enforce_equipment_service_lifecycle_before_write
before insert or update of lifecycle_state on public.equipment
for each row execute function private.enforce_equipment_service_lifecycle();

create or replace function public.start_equipment_service(
  p_equipment_id uuid,
  p_event_type public.equipment_service_event_type,
  p_started_on date,
  p_service_provider text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.equipment%rowtype;
  service_id uuid;
begin
  select equipment.* into target
  from public.equipment as equipment
  where equipment.id = p_equipment_id
    and private.is_studio_admin(equipment.studio_id)
  for update;

  if not found then raise exception 'equipment_not_found_or_forbidden'; end if;
  if p_event_type is null or target.lifecycle_state in ('in_service', 'retired') then
    raise exception 'equipment_cannot_start_service';
  end if;
  if p_started_on is null
    or p_started_on > (now() at time zone 'Europe/Kyiv')::date then
    raise exception 'invalid_service_start_date';
  end if;

  insert into public.equipment_service_events (
    studio_id, equipment_id, event_type, started_on, service_provider, started_notes
  ) values (
    target.studio_id,
    target.id,
    p_event_type,
    p_started_on,
    nullif(btrim(p_service_provider), ''),
    nullif(btrim(p_notes), '')
  ) returning id into service_id;

  update public.equipment
  set lifecycle_state = 'in_service'
  where id = target.id;

  return service_id;
end;
$$;

revoke execute on function public.start_equipment_service(
  uuid, public.equipment_service_event_type, date, text, text
) from public, anon, service_role;
grant execute on function public.start_equipment_service(
  uuid, public.equipment_service_event_type, date, text, text
) to authenticated;

create or replace function public.complete_equipment_service(
  p_service_event_id uuid,
  p_completed_on date,
  p_return_state public.equipment_lifecycle_state,
  p_cost_amount numeric default null,
  p_cost_currency text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  service public.equipment_service_events%rowtype;
  target public.equipment%rowtype;
begin
  select event.* into service
  from public.equipment_service_events as event
  where event.id = p_service_event_id
    and event.completed_on is null
    and private.is_studio_admin(event.studio_id)
  for update;

  if not found then raise exception 'service_event_not_found_or_forbidden'; end if;

  select equipment.* into target
  from public.equipment as equipment
  where equipment.id = service.equipment_id
  for update;

  if target.lifecycle_state <> 'in_service' then
    raise exception 'equipment_is_not_in_service';
  end if;
  if p_return_state is null or p_return_state not in ('active', 'spare') then
    raise exception 'invalid_equipment_return_state';
  end if;
  if p_completed_on is null
    or p_completed_on < service.started_on
    or p_completed_on > (now() at time zone 'Europe/Kyiv')::date then
    raise exception 'invalid_service_completion_date';
  end if;

  update public.equipment_service_events
  set
    completed_on = p_completed_on,
    cost_amount = p_cost_amount,
    cost_currency = nullif(btrim(p_cost_currency), ''),
    completion_notes = nullif(btrim(p_notes), '')
  where id = service.id;

  update public.equipment
  set
    lifecycle_state = p_return_state,
    next_maintenance_due_date = case
      when service.event_type = 'regular_maintenance'
        and recurring_maintenance_enabled
      then (p_completed_on + make_interval(months => maintenance_interval_months))::date
      else next_maintenance_due_date
    end
  where id = target.id;

  return target.id;
end;
$$;

revoke execute on function public.complete_equipment_service(
  uuid, date, public.equipment_lifecycle_state, numeric, text, text
) from public, anon, service_role;
grant execute on function public.complete_equipment_service(
  uuid, date, public.equipment_lifecycle_state, numeric, text, text
) to authenticated;

create or replace function public.record_equipment_history_event(
  p_equipment_id uuid,
  p_event_type public.equipment_service_event_type,
  p_completed_on date,
  p_started_on date default null,
  p_service_provider text default null,
  p_cost_amount numeric default null,
  p_cost_currency text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.equipment%rowtype;
  history_id uuid;
  effective_started_on date := coalesce(p_started_on, p_completed_on);
begin
  select equipment.* into target
  from public.equipment as equipment
  where equipment.id = p_equipment_id
    and private.is_studio_admin(equipment.studio_id);

  if not found then raise exception 'equipment_not_found_or_forbidden'; end if;
  if p_event_type is null or p_event_type not in ('repair', 'upgrade') then
    raise exception 'history_event_must_be_repair_or_upgrade';
  end if;
  if p_completed_on is null
    or effective_started_on > p_completed_on
    or p_completed_on > (now() at time zone 'Europe/Kyiv')::date then
    raise exception 'invalid_history_event_dates';
  end if;

  insert into public.equipment_service_events (
    studio_id,
    equipment_id,
    event_type,
    started_on,
    completed_on,
    service_provider,
    cost_amount,
    cost_currency,
    completion_notes
  ) values (
    target.studio_id,
    target.id,
    p_event_type,
    effective_started_on,
    p_completed_on,
    nullif(btrim(p_service_provider), ''),
    p_cost_amount,
    nullif(btrim(p_cost_currency), ''),
    nullif(btrim(p_notes), '')
  ) returning id into history_id;

  return history_id;
end;
$$;

revoke execute on function public.record_equipment_history_event(
  uuid, public.equipment_service_event_type, date, date, text, numeric, text, text
) from public, anon, service_role;
grant execute on function public.record_equipment_history_event(
  uuid, public.equipment_service_event_type, date, date, text, numeric, text, text
) to authenticated;

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
  generated_count integer := 0;
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

    for recipient in
      select member.user_id
      from public.studio_members as member
      inner join public.profiles as profile on profile.id = member.user_id
      where member.studio_id = target.studio_id
        and member.system_role = 'admin'
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
        target.display_name || ' is due for maintenance on ' || target.next_maintenance_due_date || '.',
        '/office/equipment?view=maintenance&item=' || target.id,
        'equipment',
        target.id,
        jsonb_build_object(
          'equipmentName', target.display_name,
          'dueDate', target.next_maintenance_due_date,
          'threshold', case
            when notification_kind = 'equipment_maintenance_overdue' then 'overdue'
            else 'upcoming'
          end
        )
      );
      generated_count := generated_count + 1;
    end loop;

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
