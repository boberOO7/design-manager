-- Equipment names are optional aliases. Inventory codes remain the stable identity.
alter table public.equipment alter column display_name drop not null;

-- These exact values were emitted by the previous application fallback. Preserve
-- every other value as user-authored.
update public.equipment
set display_name = null
where lower(display_name) = lower(asset_tag)
   or lower(display_name) = equipment_type::text
   or lower(display_name) = replace(equipment_type::text, '_', ' ');

create or replace function private.enforce_equipment_studio_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.studio_id is distinct from old.studio_id then
    raise exception 'equipment_studio_is_immutable';
  end if;
  if new.equipment_type is distinct from old.equipment_type then
    raise exception 'equipment_type_is_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_equipment_studio_identity()
from public, anon, authenticated;

create or replace function private.reserve_equipment_inventory_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_prefix text;
  next_number bigint;
begin
  if current_setting('role', true) = 'authenticated'
    and not private.is_studio_admin(new.studio_id) then
    raise exception 'equipment row-level security policy' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.asset_tag is not null then
    if new.asset_tag is null then
      raise exception 'inventory_code_required' using errcode = '23514';
    end if;
    if lower(new.asset_tag) = lower(old.asset_tag) then return new; end if;
  end if;

  code_prefix := case new.equipment_type
    when 'pc' then 'PC' when 'laptop' then 'LAP'
    when 'monitor' then 'MON' when 'mouse' then 'MOU'
    when 'keyboard' then 'KBD' when 'headphones' then 'HEAD'
    when 'webcam' then 'CAM' when 'air_conditioner' then 'AC'
    when 'printer' then 'PRN' when 'coffee_machine' then 'COF'
    when 'other' then 'EQ'
  end;

  if new.asset_tag is not null then
    if new.asset_tag !~* ('^' || code_prefix || '-[0-9]+$') then
      raise exception 'inventory_code_format' using errcode = '23514';
    end if;
    new.asset_tag := code_prefix || '-' || substring(new.asset_tag from '[0-9]+$');
    insert into private.equipment_inventory_codes(studio_id, code)
    values (new.studio_id, lower(new.asset_tag));
    return new;
  end if;

  loop
    insert into private.equipment_inventory_counters as counter(studio_id, prefix, last_number)
    values (new.studio_id, code_prefix, 1)
    on conflict (studio_id, prefix) do update set last_number = counter.last_number + 1
    returning last_number into next_number;
    new.asset_tag := code_prefix || '-' || lpad(next_number::text, greatest(2, length(next_number::text)), '0');
    insert into private.equipment_inventory_codes(studio_id, code)
    values (new.studio_id, lower(new.asset_tag)) on conflict do nothing;
    exit when found;
  end loop;
  return new;
end;
$$;

revoke execute on function private.reserve_equipment_inventory_code()
from public, anon, authenticated, service_role;

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
