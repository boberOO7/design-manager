-- Run in the production SQL editor with authorized read access. This script
-- performs SELECTs only and ends in ROLLBACK. Do not retry the production PATCH
-- as a diagnostic: it can change RSVP data.
-- Replace NULL::uuid below with the verified auth.getUser().user.id from the
-- failing request (never supply cookies/JWT). NULL keeps actor checks unknown.
-- Also retain the failing request body/status and HTTP-400 JSON, and correlate
-- its UTC timestamp with Vercel invocation and Supabase Postgres/API logs.
begin read only;

with incident as (
  select 'bed28a5b-b4b4-40dc-8574-1eac4ec3eb31'::uuid as invite_id,
         '5b00eeb9-eb38-49f0-85b2-567db4d6d5e2'::uuid as expected_event_id,
         NULL::uuid as authenticated_user_id,
         'accepted'::text as requested_status
)
select incident.invite_id, incident.expected_event_id, incident.authenticated_user_id,
       invite.id is not null as invitation_exists,
       invite.event_id, invite.event_id = incident.expected_event_id as event_matches,
       invite.user_id as invited_user_id,
       invite.user_id = incident.authenticated_user_id as actor_is_invitee,
       invite.status, invite.status::text = incident.requested_status as response_already_saved,
       invite.responded_at, invite.updated_at, invite.invited_by,
       event.studio_id, event.organizer_id, event.event_type, event.cancelled_at,
       event.series_id, event.project_id, project.status as project_status,
       invitee_profile.is_active as invitee_profile_active,
       invitee_member.is_active as invitee_studio_member_active,
       actor_profile.is_active as actor_profile_active,
       actor_member.is_active as actor_studio_member_active,
       actor_project_member.is_active as actor_project_member_active,
       (select count(*) from public.studio_members member
        join public.profiles profile on profile.id = member.user_id
        where member.user_id = incident.authenticated_user_id
          and member.is_active and profile.is_active) as actor_active_studio_count
from incident
left join public.calendar_event_invites invite on invite.id = incident.invite_id
left join public.calendar_events event on event.id = invite.event_id
left join public.projects project on project.id = event.project_id
left join public.profiles invitee_profile on invitee_profile.id = invite.user_id
left join public.studio_members invitee_member on invitee_member.user_id = invite.user_id and invitee_member.studio_id = event.studio_id
left join public.profiles actor_profile on actor_profile.id = incident.authenticated_user_id
left join public.studio_members actor_member on actor_member.user_id = incident.authenticated_user_id and actor_member.studio_id = event.studio_id
left join public.project_members actor_project_member on actor_project_member.user_id = incident.authenticated_user_id and actor_project_member.project_id = event.project_id;

-- An unread notification can still offer Accept after Calendar saved accepted.
-- Metadata is a historical link; it does not establish invitation ownership.
select id, recipient_id, read_at, entity_id, metadata ->> 'inviteId' as invite_id
from public.notifications
where notification_type = 'calendar_event_invitation'
  and (metadata ->> 'inviteId' = 'bed28a5b-b4b4-40dc-8574-1eac4ec3eb31'
       or entity_id = '5b00eeb9-eb38-49f0-85b2-567db4d6d5e2'::uuid);

-- Relevant history is evidence of recorded application, not proof of the live
-- definitions below. Later migrations can change helpers and triggers.
select expected.version, applied.version is not null as recorded_applied, applied.name
from (values
  ('20260819110000'), -- invite table, enum, grants, RLS, RSVP trigger
  ('20260820140000'), -- organizer authorization
  ('20260820150000'), -- returning visibility/grants
  ('20260829170000'), -- current can_view_calendar_event definition
  ('20260829220311'), -- interview invitation specialization
  ('20260902140546'), -- transactional Google outbox trigger
  ('20260907153151'), -- latest validate_calendar_event_invite definition
  ('20261003085246')  -- site visits use participants instead of RSVP
) expected(version)
left join supabase_migrations.schema_migrations applied on applied.version = expected.version
order by expected.version;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('calendar_event_invites', 'calendar_events', 'studio_members', 'profiles')
order by tablename, policyname;

select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid in ('public.calendar_event_invites'::regclass, 'public.calendar_events'::regclass);

select column_name,
       has_column_privilege('authenticated', 'public.calendar_event_invites', column_name, 'SELECT') as can_select,
       has_column_privilege('authenticated', 'public.calendar_event_invites', column_name, 'UPDATE') as can_update
from information_schema.columns
where table_schema = 'public' and table_name = 'calendar_event_invites'
order by ordinal_position;

select enum.enumlabel
from pg_enum enum
where enum.enumtypid = 'public.calendar_event_invitation_status'::regtype
order by enum.enumsortorder;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.calendar_event_invites'::regclass;

-- The BEFORE trigger must reject cancelled/missing events, another actor and
-- unchanged status, and assign responded_at. UPDATE RLS and SELECT visibility
-- are both required. Project/inviter eligibility checks are INSERT-only in the
-- current RSVP validator; an archived project alone does not explain RSVP 400.
select trigger.tgname, trigger.tgenabled, pg_get_triggerdef(trigger.oid) as definition,
       pg_get_functiondef(trigger.tgfoid) as function_definition
from pg_trigger trigger
where trigger.tgrelid = 'public.calendar_event_invites'::regclass and not trigger.tgisinternal;

select function.oid::regprocedure as function_name, function.prosecdef,
       pg_get_userbyid(function.proowner) as owner, function.proconfig,
       pg_get_functiondef(function.oid) as definition
from pg_proc function
join pg_namespace namespace on namespace.oid = function.pronamespace
where namespace.nspname = 'private'
  and function.proname in ('can_view_calendar_event', 'is_studio_member',
                          'enqueue_google_calendar_relation_change', 'enqueue_google_calendar_reconciliation');

-- An outbox enqueue error rolls back RSVP itself. Google worker/token/network
-- failures happen after the response and cannot generate the original 400.
select to_regclass('public.google_calendar_reconciliation_jobs') as outbox_table;
rollback;
