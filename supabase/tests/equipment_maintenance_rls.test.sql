begin;
select plan(44);

insert into public.studios(id, name) values
  ('48000000-0000-0000-0000-000000000001', 'Maintenance Studio'),
  ('48000000-0000-0000-0000-000000000002', 'Other Studio');

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('48000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'maintenance-admin@test', '{}', '{}', now(), now()),
  ('48000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'maintenance-admin-2@test', '{}', '{}', now(), now()),
  ('48000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'maintenance-employee@test', '{}', '{}', now(), now()),
  ('48000000-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'maintenance-inactive@test', '{}', '{}', now(), now()),
  ('48000000-0000-0000-0000-000000000014', 'authenticated', 'authenticated', 'maintenance-other-admin@test', '{}', '{}', now(), now());

insert into public.profiles(id, full_name, email, system_role, is_active) values
  ('48000000-0000-0000-0000-000000000010', 'Maintenance Admin', 'maintenance-admin@test', 'admin', true),
  ('48000000-0000-0000-0000-000000000011', 'Maintenance Admin 2', 'maintenance-admin-2@test', 'admin', true),
  ('48000000-0000-0000-0000-000000000012', 'Maintenance Employee', 'maintenance-employee@test', 'employee', true),
  ('48000000-0000-0000-0000-000000000013', 'Inactive Admin', 'maintenance-inactive@test', 'admin', false),
  ('48000000-0000-0000-0000-000000000014', 'Other Admin', 'maintenance-other-admin@test', 'admin', true);

insert into public.studio_members(studio_id, user_id, system_role, is_active) values
  ('48000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000010', 'admin', true),
  ('48000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000011', 'admin', true),
  ('48000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000012', 'employee', true),
  ('48000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000013', 'admin', true),
  ('48000000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000014', 'admin', true);

insert into public.workstations(id, studio_id, number, name) values
  ('48000000-0000-0000-0000-000000000100', '48000000-0000-0000-0000-000000000001', 1, 'Maintenance Desk');
insert into public.equipment(id, studio_id, workstation_id, equipment_type, display_name, recurring_maintenance_enabled, maintenance_interval_months, next_maintenance_due_date) values
  ('48000000-0000-0000-0000-000000000200', '48000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000100', 'pc', 'Maintenance PC', true, 2, '2026-09-30'),
  ('48000000-0000-0000-0000-000000000201', '48000000-0000-0000-0000-000000000001', null, 'printer', 'Overdue Printer', true, 6, '2026-08-30'),
  ('48000000-0000-0000-0000-000000000202', '48000000-0000-0000-0000-000000000002', null, 'printer', 'Other Studio Printer', true, 6, '2026-09-30');

select is((select enum_range(null::public.equipment_service_event_type)::text), '{regular_maintenance,repair,upgrade}', 'all history event types exist');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.equipment_service_events'::regclass), 'service history has RLS');
select throws_like($$insert into public.equipment(studio_id, equipment_type, display_name, recurring_maintenance_enabled) values ('48000000-0000-0000-0000-000000000001', 'mouse', 'Invalid schedule', true)$$, '%equipment_maintenance_schedule_check%', 'enabled recurrence requires interval and due date');
select throws_like($$insert into public.equipment(studio_id, equipment_type, display_name, maintenance_interval_months) values ('48000000-0000-0000-0000-000000000001', 'mouse', 'Disabled schedule', 3)$$, '%equipment_maintenance_schedule_check%', 'disabled recurrence cannot retain active schedule fields');

select set_config('request.jwt.claim.sub', '48000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select is((select count(*)::integer from public.equipment), 2, 'admin can read maintenance equipment');
select throws_like($$update public.equipment set lifecycle_state = 'in_service' where id = '48000000-0000-0000-0000-000000000200'$$, '%equipment_service_event_required%', 'in-service lifecycle requires an open service event');

set local role postgres;
update public.equipment
set recurring_maintenance_enabled = false,
    maintenance_interval_months = null,
    next_maintenance_due_date = null
where studio_id not in (
  '48000000-0000-0000-0000-000000000001',
  '48000000-0000-0000-0000-000000000002'
);
select is(public.generate_equipment_maintenance_notifications('2026-08-31'), 5, '30-day boundary and overdue boundary notify each active admin');
select is(public.generate_equipment_maintenance_notifications('2026-08-31'), 0, 'same threshold run is deduplicated');
select is((select count(distinct recipient_id)::integer from public.notifications where studio_id = '48000000-0000-0000-0000-000000000001' and entity_type = 'equipment'), 2, 'only active admin recipients are selected');
select is((select count(*)::integer from public.notifications where studio_id = '48000000-0000-0000-0000-000000000001' and notification_type = 'equipment_maintenance_upcoming'), 2, 'upcoming notifications use the upcoming type');
select is((select count(*)::integer from public.notifications where studio_id = '48000000-0000-0000-0000-000000000001' and notification_type = 'equipment_maintenance_overdue'), 2, 'past due dates use the overdue type');
select is((select count(*)::integer from public.notifications where studio_id = '48000000-0000-0000-0000-000000000002' and recipient_id = '48000000-0000-0000-0000-000000000014'), 1, 'another studio reminder reaches only its active admin');
select is((select count(*)::integer from public.notifications where studio_id = '48000000-0000-0000-0000-000000000001' and recipient_id = '48000000-0000-0000-0000-000000000014'), 0, 'notification recipients never cross tenant boundaries');

update public.equipment set next_maintenance_due_date = '2026-09-29' where id = '48000000-0000-0000-0000-000000000200';
select is((select maintenance_upcoming_notified_for is null and maintenance_overdue_notified_for is null from public.equipment where id = '48000000-0000-0000-0000-000000000200'), true, 'changing the due date resets both threshold markers');
select is(public.generate_equipment_maintenance_notifications('2026-08-31'), 2, 'a changed due date can notify for its new cycle');
select is(public.generate_equipment_maintenance_notifications('2026-08-31'), 0, 'the changed due-date cycle remains deduplicated');
update public.equipment set lifecycle_state = 'retired', next_maintenance_due_date = '2026-08-29' where id = '48000000-0000-0000-0000-000000000201';
select is(public.generate_equipment_maintenance_notifications('2026-08-31'), 0, 'retired equipment does not generate reminders even with recurrence enabled');
update public.equipment set recurring_maintenance_enabled = false, maintenance_interval_months = null, next_maintenance_due_date = null where id = '48000000-0000-0000-0000-000000000202';
select is(public.generate_equipment_maintenance_notifications('2026-08-31'), 0, 'disabled recurrence does not generate reminders');

select set_config('request.jwt.claim.sub', '48000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok($$select public.start_equipment_service('48000000-0000-0000-0000-000000000200', 'regular_maintenance', '2026-09-01', 'FixLab', 'Dust cleanup')$$, 'admin can send equipment into service');
select is((select lifecycle_state::text from public.equipment where id = '48000000-0000-0000-0000-000000000200'), 'in_service', 'starting service sets lifecycle to in service');
select is((select count(*)::integer from public.equipment_service_events where equipment_id = '48000000-0000-0000-0000-000000000200' and completed_on is null), 1, 'service start creates one open history row');
select throws_like($$update public.equipment set lifecycle_state = 'active' where id = '48000000-0000-0000-0000-000000000200'$$, '%equipment_service_must_be_completed%', 'open service cannot be bypassed with a lifecycle edit');
select throws_like($$select public.start_equipment_service('48000000-0000-0000-0000-000000000200', 'repair', '2026-09-02', null, null)$$, '%equipment_cannot_start_service%', 'only one service can be open');
update public.equipment set next_maintenance_due_date = '2026-09-28' where id = '48000000-0000-0000-0000-000000000200';
set local role postgres;
select is(public.generate_equipment_maintenance_notifications('2026-08-31'), 2, 'in-service equipment remains eligible until a maintenance cycle is completed');
select is(public.generate_equipment_maintenance_notifications('2026-08-31'), 0, 'in-service reminders remain deduplicated');
select set_config('request.jwt.claim.sub', '48000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok($$select public.complete_equipment_service((select id from public.equipment_service_events where equipment_id = '48000000-0000-0000-0000-000000000200' and completed_on is null), '2026-09-10', 'active', 1200, 'UAH', 'Completed')$$, 'admin can complete and return equipment');
select is((select lifecycle_state::text from public.equipment where id = '48000000-0000-0000-0000-000000000200'), 'active', 'completion restores the chosen normal lifecycle');
select is((select next_maintenance_due_date from public.equipment where id = '48000000-0000-0000-0000-000000000200'), '2026-11-10'::date, 'next due date uses actual completion plus interval');
select is((select count(*)::integer from public.equipment_service_events where equipment_id = '48000000-0000-0000-0000-000000000200' and event_type = 'regular_maintenance' and completed_on = '2026-09-10'), 1, 'completed maintenance remains in history');

set local role postgres;
select is(public.generate_equipment_maintenance_notifications('2026-10-11'), 2, 'new maintenance cycle can send upcoming notifications');
select is(public.generate_equipment_maintenance_notifications('2026-10-11'), 0, 'new-cycle upcoming notification is deduplicated');
select is(public.generate_equipment_maintenance_notifications('2026-11-11'), 2, 'same cycle can later send one overdue notification per admin');
select is(public.generate_equipment_maintenance_notifications('2026-11-11'), 0, 'overdue notification is deduplicated');

select set_config('request.jwt.claim.sub', '48000000-0000-0000-0000-000000000010', true);
set local role authenticated;
select lives_ok($$select public.record_equipment_history_event('48000000-0000-0000-0000-000000000200', 'repair', '2026-09-10', '2026-09-09', 'FixLab', null, null, 'Fan replacement')$$, 'admin can record an independent repair');
select lives_ok($$select public.record_equipment_history_event('48000000-0000-0000-0000-000000000200', 'upgrade', '2026-09-10', null, null, 500, 'USD', 'RAM upgrade')$$, 'admin can record an independent upgrade with optional cost');
select is((select count(distinct event_type)::integer from public.equipment_service_events where equipment_id = '48000000-0000-0000-0000-000000000200'), 3, 'maintenance repair and upgrade history all persist');
select lives_ok($$update public.equipment set workstation_id = null, lifecycle_state = 'retired', recurring_maintenance_enabled = false, maintenance_interval_months = null, next_maintenance_due_date = null where id = '48000000-0000-0000-0000-000000000200'$$, 'equipment can be detached retired and recurrence disabled');
select is((select count(*)::integer from public.equipment_service_events where equipment_id = '48000000-0000-0000-0000-000000000200'), 3, 'history survives reassignment retirement and recurrence disablement');

set local role postgres;
select set_config('request.jwt.claim.sub', '48000000-0000-0000-0000-000000000012', true);
set local role authenticated;
select is((select count(*)::integer from public.equipment_service_events), 0, 'employees cannot read service history');
select throws_like($$insert into public.equipment_service_events(studio_id, equipment_id, event_type, started_on) values ('48000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000201', 'repair', '2026-09-01')$$, '%permission denied%', 'employees cannot insert service history');
select throws_like($$select public.start_equipment_service('48000000-0000-0000-0000-000000000201', 'repair', '2026-09-01', null, null)$$, '%equipment_not_found_or_forbidden%', 'employee cannot invoke service workflow on equipment');
select throws_like($$select public.generate_equipment_maintenance_notifications('2026-09-01')$$, '%permission denied%', 'authenticated users cannot invoke the notification worker');

set local role postgres;
select set_config('request.jwt.claim.sub', '48000000-0000-0000-0000-000000000014', true);
set local role authenticated;
select is((select count(*)::integer from public.equipment_service_events), 0, 'another studio admin cannot read history');

set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_like($$select * from public.equipment_service_events$$, '%permission denied%', 'anonymous users cannot read service history');

select * from finish();
rollback;
