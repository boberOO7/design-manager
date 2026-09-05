# Studio operations

This domain covers non-project studio work: Team, Administration, Contractors,
Office, and in-app notifications. These records do not contribute to project
progress or productivity unless a separate domain explicitly says so.

## Team and Administration

| Area | Responsibilities | Canonical paths |
| --- | --- | --- |
| Team | Active/former directory, invitations, profile editing, self-service profile fields, removal impact, reassignment, restoration | `src/app/(app)/team/`, `src/data/queries/team.ts`, `src/components/team/` |
| Administration | Pending time-off queue, upcoming availability, recent decisions, checklist templates, Leaderboard bonus settings | `src/app/(app)/admin/`, `src/data/queries/administration.ts`, `src/components/administration/` |

Invariants:

- Invitations are administrator-only and always create employee access in the
  inviter's active studio; they do not create project membership.
- `job_title` is professional metadata, not authority.
- Studio-member removal and restoration are durable lifecycle operations, not
  user deletion. Open work impact and reassignment are handled atomically.
- Administration is an action queue, not a duplicate Dashboard. Time-off review
  uses the same backend workflow as Calendar.
- Recent decisions are quiet history, not the general project Activity History.

## Contractors

- Contractors are studio-scoped through category ownership.
- Any active studio member can create and update contractor records and resolve
  category/subcategory classification.
- Only administrators may delete contractors, change category colors, rename
  categories, or delete unused categories.
- Categories cannot be deleted while contractors reference them. Contractors
  cannot be moved across studios by changing category.
- Contractor information has no project, task, productivity, or assignment
  relationship in the current model.

Canonical paths: `src/app/(app)/contractors/`,
`src/data/queries/contractors.ts`, `src/components/contractors/`, and contractor
migrations/tests.

## Office

Office is the canonical home for internal submissions and standalone assignments.
Legacy `/submissions` entry points redirect to `/office/submissions`.

### Submissions

- Types are request, suggestion, and complaint; priority defaults to Normal.
- The inbox separates active work from terminal History.
- Type-specific transition helpers in `src/lib/submissions.ts` are presentation
  guidance; database RPCs enforce atomic assignment and transition.
- Starting request work requires an active responsible studio member.
- Assignment and status transition are performed together by `manage_submission`.
- Suggestions have support/reaction behavior distinct from managed request work.
- Anonymous complaints store no author identity and expose no participant
  assignment or communication UI. Administrator details remain separately
  protected.

### Office assignments

- Workflow is `assigned -> in_progress -> done`; administrators may cancel from
  assigned or in-progress.
- Administrators create and fully manage assignments. The responsible active
  member can read and advance their own assignment, but only an administrator can
  cancel or reassign it.
- Creator and studio identity are immutable; responsible person must remain an
  active member when written.
- Office assignments have no project, task, area, progress, Rating, or
  productivity relationship.

Canonical paths: `src/app/(app)/office/`, `src/data/queries/submissions.ts`,
`src/data/queries/office-assignments.ts`, `src/lib/submissions.ts`, and the
submission/office-assignment migrations and RLS tests.

## Notifications

Notifications are persistent, recipient-private, database-generated operational
messages. They are not activity history.

| Producer | Typical recipients/navigation |
| --- | --- |
| Task assignment/detail change | Assignee; project task drawer |
| Time-off submission/decision/cancellation | Active admins or requester; Administration/Calendar |
| Calendar invitation/update/cancellation/assignment | Relevant invitee or assignee; Calendar item |
| Submission create/assign/status | Active admins, responsible member, or non-anonymous author; Office submission |
| Office assignment assign/status | Responsible member or creator; Office assignment |

Invariants:

- `notifications` rows are created through private database helpers/triggers;
  callers do not author arbitrary recipient messages.
- The actor is not notified of their own action, and inactive recipients are
  skipped.
- A recipient may select their own rows and change only `read_at`; notifications
  cannot be marked unread or have content/identity changed.
- Header queries return the latest 30 items and a separate exact unread count.
- Mark-one and mark-all operations constrain updates to the authenticated
  recipient.
- Pending Administration counts and notification unread counts are different
  concepts.
- Scheduled deadline reminders, email, push, and realtime subscriptions are not
  implemented.

Canonical paths: `src/data/queries/notifications.ts`,
`src/components/layout/notification-bell.tsx`, `src/app/api/notifications/`, and
notification-producing migrations.
