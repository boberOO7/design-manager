# Calendar

## Boundary

Calendar presents stored events and live projections through one normalized UI
model. Only real studio events live in `calendar_events`; project deadlines,
task milestone deadlines, availability, and people/studio events retain their
own canonical sources.

## Calendar item sources

| Source | Canonical storage | Visibility/relevance |
| --- | --- | --- |
| Real event | `calendar_events` plus invites/participants | RLS plus semantic event roles |
| Project deadline | `projects.due_date` | Accessible assigned project or admin scope |
| Task deadline | `task_deadlines` | Accessible project; “mine” uses task assignee |
| Private time-off request | `time_off_requests` | Requester and active administrators |
| Coworker availability | Privacy-safe RPC projection | Approved intervals and generic label only |
| Birthday/anniversary | Profile and studio membership dates | Active studio membership rules |
| Salary payment | Team membership dates, admin view | Administrator operational action |
| Studio day off | `studio_days_off` | Active studio members |

Views are Month, Week, and Agenda. Task deadlines are hidden by default in dense
views. Timed values are absolute `timestamptz` displayed in `Europe/Kyiv`;
project/task deadlines and full-day time off preserve date-only semantics.

## Semantic event types

Real events use language-neutral types: general, meeting, interview, site visit,
business trip, presentation, internal review, and work makeup. Types determine
the meaningful roles and fields: invitees, organizer/presenter, assignee,
participants, destination, meeting mode, recurrence, or linked day off.

Invariants:

- New project events are limited to planned, active, or paused projects.
- Completed projects must be reopened before a new event is added. Existing
  historical events remain readable and cancellable.
- Archived projects cannot receive events.
- Event creation with invitations is atomic. Specialized participant/assignee
  updates use guarded database operations.
- Recurrence preserves a root series and occurrence identity; update/cancel
  behavior must keep Google mappings and reconciliation rooted consistently.

## “Relevant to me”

`isCalendarEventRelevantToUser()` is the canonical predicate for real events:

| Event type | Relevant user |
| --- | --- |
| Site visit, interview | Assignee |
| Business trip | Participant |
| Meeting, presentation | Organizer or invitee |
| General, internal review | Invitee |
| Work makeup | Organizer |

The Calendar “mine” filter and Google projection share this rule. RLS visibility
is broader in some cases and must not be substituted for synchronization
relevance.

## Time off and privacy

- Request types and their approval thresholds are domain rules; inspect the
  current time-off migrations and `src/lib/administration.ts` before changing
  them.
- Request type, private note, review note, pending state, and rejection state are
  limited to the requester and active administrators.
- Coworkers receive only approved interval, display name, and “Out of office”
  through `get_calendar_coworker_availability`.
- Administration and Calendar share the same Route Handler review workflow.
- Approval/rejection/cancellation notifications exclude private/review notes.
- Work-makeup events link to approved day-off requests and must preserve the
  compensation relationship.

## Google Calendar projection

- Projection is one-way: StudioFlow to a dedicated secondary
  `{studioName} Team` calendar for each connected user.
- StudioFlow remains authoritative. Google-to-StudioFlow sync is not implemented.
- Connect creates and persists an exact secondary-calendar ID. Disconnect deletes
  that calendar before revoking authorization and clearing local connection state.
- Manual full repair and event-scoped reconciliation use the same relevance
  predicate and deterministic source keys.
- Event, invitation, participant, assignee, cancellation, and recurrence writes
  enqueue one coalesced outbox row per root event in the same transaction.
- Post-response processing is an accelerator. The protected scheduled drain is
  the durable retry path with bounded attempts.
- Revoked/expired credentials mark the connection for reconnection and must not
  fail the originating StudioFlow Calendar write.
- Synthetic Calendar items, external calendars, attendees, reminders, holidays,
  and inbound synchronization are not projected.

## Canonical sources

- `src/types/calendar.ts`
- `src/lib/calendar.ts`
- `src/lib/calendar-event-types.ts`
- `src/lib/calendar-event-form.ts`
- `src/lib/calendar-recurrence.ts`
- `src/lib/calendar-system-events.ts`
- `src/lib/validation/calendar.ts`
- `src/data/queries/calendar.ts`
- `src/data/queries/calendar-item.ts`
- `src/app/api/calendar/`
- `src/lib/google-calendar/`
- `src/app/api/integrations/google-calendar/`
- Calendar, time-off, invitation, recurrence, semantic-type, day-off, task-deadline,
  and Google reconciliation migrations and tests
