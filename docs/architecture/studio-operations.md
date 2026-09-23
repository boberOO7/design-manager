# Studio operations

This domain covers non-project studio work: Team, Administration, CRM, Contractors,
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
- Realtime popup and sound preferences are profile-level presentation settings
  saved through the guarded self-service profile RPC; they do not affect
  notification creation or read state.

Dashboard uses a separate admin-only summary: the same capped pending queue count
and three upcoming absences, without review notes, approval details, history,
member statistics, checklist templates, or bonus configuration. Pending requests
join the actionable exception strip; approved absences remain a dedicated compact
section linking back to Calendar. The Administration workspace retains its full model.

## Contractors

Finance may reference a contractor for project bonus **income**. It checks tenant
ownership through the contractor category and retains a private name snapshot.
Referenced contractors cannot be deleted; directory edits do not rewrite Finance.

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

## CRM

- CRM is admin-only and scoped to the administrator's active studio at both the
  route/server-action layer and the database RLS boundary.
- Leads retain an explicit first-contact date independently from status and
  follow-up changes.
- Lead creation and status changes append actor-attributed lifecycle rows in
  `crm_lead_history`; ordinary field edits are intentionally not audited there.
- A Lead follow-up is an exact `timestamptz`. It schedules one unread in-app
  notification for the responsible active administrator and projects a timed,
  admin-only item into StudioFlow Calendar without creating a `calendar_events`
  row. Date/time or assignee changes replace the unread reminder; read reminder
  history does not resolve the Lead follow-up. Completing or cancelling clears
  the active follow-up, and deleting the Lead removes its reminder history.
- `invalid` is the one inactive follow-up status. Invalid Leads are excluded
  consistently from CRM attention counts, Calendar projection, and reminders.
- Overdue state derives from the active Lead follow-up timestamp and therefore
  persists independently of notification read state. Completion records
  `last_contacted_at`; the administrator may then schedule the next follow-up.
  The authenticated shell counts overdue active follow-ups assigned to the
  current administrator for the CRM navigation badge, and the Leads workspace
  exposes the same population as an optional attention filter. The admin
  Dashboard reuses that assigned population for its overdue exception and
  upcoming feed; links open the existing Leads workspace/filter or Lead detail.
- The terminal `invalid` Lead status optionally records a structured invalid
  reason, clears any active follow-up, and cannot be converted to a Project.
- Lead project type, country, and city selection reuse the canonical Project
  metadata controls. New leads default to Ukraine; legacy free-text country and
  budget values remain readable until an administrator replaces them.
- Lead budgets use separate amount and compact currency controls and persist a
  positive amount with UAH, USD, EUR, or PLN as separate values for filtering
  and reporting. New leads default to UAH; no exchange conversion occurs.
- Lead source choices persist stable canonical keys for built-in options while
  custom `Other` values remain free text, so labels can stay localized without
  losing older arbitrary source values.
- A Lead that is neither lost nor invalid can create one Project through the
  shared Project form. The existing Project/template RPC locks the Lead, creates
  the Project and template work, links both records, and marks the Lead Won in
  one transaction. The normal status trigger and a project-linked lifecycle row
  preserve both events; manual Won remains valid without a Project, while a
  linked Lead cannot later drift away from Won.
- Candidate identity/contact data lives in `crm_candidates`; each hiring attempt
  lives in `crm_recruiting_cycles`. Starting a later cycle inserts a new row and
  preserves prior interview notes, test results, and outcomes.
  The directory reads only one cycle summary per candidate: position, stage,
  outcome, next-contact date, and ID. The existing latest-cycle rule is descending
  `started_at`, without preferring active outcomes; descending ID breaks date ties
  consistently in summaries and complete history. Opening a Candidate dialog
  loads all its cycle fields and pages through the full history under admin RLS.
  Reads are reused within the authoritative candidate snapshot; mutation
  revalidation invalidates reuse even when a new cycle leaves the candidate's
  `updated_at` unchanged. Dialog selection remains local, without URL navigation.
- Candidate creation and editor saves use guarded RPCs so contact and recruiting
  cycle fields commit or roll back together. Empty responsible-admin selection
  remains unassigned. Interview wall times are interpreted in StudioFlow's
  `Europe/Kyiv` timezone before persistence.
- At most one recruiting cycle per candidate may be active (without a final
  outcome). Final outcomes are Hired, Reserve, and Rejected.
- Candidate-to-member conversion remains intentionally manual.
- CRM mutation Server Actions revalidate their workspace. Clients retain local
  detail/optimistic updates and consume the revalidated render without an
  additional route refresh; reading Lead history remains a separate action.

Canonical paths: `src/app/(app)/crm/`, `src/data/queries/crm.ts`,
`src/components/crm/`, CRM migrations, and `supabase/tests/crm*.test.sql`.

## Office

Office is the canonical home for internal submissions and standalone assignments.
Legacy `/submissions` entry points redirect to `/office/submissions`.

Assignment and Submission selection/dismissal replace URL history without a
server navigation. Creation links push history locally when their workspace is
already open; links to another workspace still navigate. Deep links initialize
the same overlays. Successful mutation Server Actions own workspace revalidation.

Office overview reads lightweight status/identity rows under the workspace RLS
and population/order rules, then fetches display fields only for the six recent
items. It reuses domain status/overdue helpers and does not load discussions,
reactions, internal notes, descriptions, creator details, or member pickers.
The full Submissions and Assignments workspace loaders remain independent.

### Submissions

- Types are request, suggestion, and complaint; priority defaults to Normal.
- New requests require one of the fixed request categories: equipment, office,
  software, or other. The database column remains nullable so submissions
  created before categories were introduced stay readable; suggestions and
  complaints cannot carry a request category.
- The inbox separates active work from terminal History.
- Type-specific transition helpers in `src/lib/submissions.ts` are presentation
  guidance; database RPCs enforce atomic assignment and transition.
- Starting request work requires an active responsible studio member.
- Assignment and status transition are performed together by `manage_submission`.
- Suggestions have support/reaction behavior distinct from managed request work.
- The inbox reads list fields, member pickers, and per-submission support counts
  (including current-user support); it does not fetch descriptions, comments,
  individual reactions, or private notes. Opening a drawer loads its description,
  complete ordered discussion, and administrator-only note under the same RLS.
  Detail reads are reused within the authoritative workspace snapshot, which
  successful mutation revalidation replaces. Received comment IDs merge with
  lazy results and mutation responses so Realtime echoes cannot duplicate them.
  Inline workflow actions read the current private note server-side when omitted;
  an explicit empty note from the admin form still clears it.
- Open non-anonymous submission discussions receive request-scoped comment
  inserts through Supabase Realtime; the existing submission visibility policy
  remains the read boundary for delivery. Comments received in an open discussion
  stay available when its drawer is closed and reopened within that workspace.
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

### Equipment

- `workstations` are studio-owned Office or Remote positions sharing a unique
  required positive number, an optional name, and an optional current active
  studio-member assignment. One employee may hold at most one current
  workstation assignment per studio; assignment history is intentionally not
  modeled. Admin bulk creation is an atomic guarded RPC.
- `equipment` rows have stable identities independent of workstation placement.
  The nullable, studio-safe workstation relationship supports attachment,
  detachment, and reassignment without replacing the equipment row.
- `equipment.asset_tag` is the inventory code. A private trigger automatically
  allocates a studio/type-prefixed code when omitted. Editing keeps that type
  prefix fixed and changes only the numeric suffix, including its leading zeros.
  Case-insensitive reservations survive renaming, retirement, and deletion. Only
  an administrator can rename a code; old codes cannot be reused. The private
  counters and reservation ledger have no client grants.
- Equipment stores its type, lifecycle state and category-specific identity.
  Type is immutable after creation. `display_name` is a nullable custom alias;
  inventory code is the primary displayed identity when the alias is absent.
  Exact historical generated names matching the code or type are normalized to
  null, while other names are preserved.
  PCs and laptops share a schema-validated `pc_configuration` JSON document for
  processor, integrated/discrete graphics, memory and ordered storage drives.
  PCs may additionally record motherboard and power-supply details; components
  have no separate inventory identities. Updates are atomic on the equipment row
  under its existing grants/RLS. Custom PC identity is omitted unless legacy
  values exist, while manufactured laptops retain manufacturer, model and serial
  identity. Legacy text specifications remain preserved as fallbacks.
- Legacy CPU/GPU/RAM/storage and whole-PC manufacturer/model remain verbatim;
  no migration guesses structured values. PC editing shows each saved text value
  only until the matching structured component has been saved, while summaries
  retain legacy fallback. A local reference catalog synchronized from Open Icecat provides optional
  creatable manufacturer/model suggestions independently of studio inventory;
  arbitrary values remain valid. Retired items remain inventory records.
- Create/edit uses one open identification/configuration accordion section, with
  measured height and opacity transitions and reduced-motion support. Equipment
  details and structured computer configuration autosave atomically: discrete
  selections persist immediately, while short text and numeric edits persist on
  blur so incomplete drive values never reach storage. They show a concise maintenance summary with a focused
  service-start dialog. Recurring scheduling, service completion, and history
  management live in the Maintenance view; schedule writes are atomic and do not
  submit other equipment fields.
- Workstations, equipment, maintenance configuration, and service history are
  administrator-only at grants, RLS, Server Action, and route boundaries.
- Equipment item and creation overlays stay URL-addressable without reloading
  inventory: selection/dismissal replaces the history entry, while opening a
  creation dialog pushes one. Native history stays synchronized with the client
  workspace, including nested equipment drawers and Back/Forward navigation.
  Successful Equipment Server Actions revalidate the workspace; clients consume
  that updated render without issuing an additional refresh.
  Initial data includes only the open service ID, type, and start date alongside
  equipment maintenance state. Completed history loads in full, per item, when
  its Maintenance drawer opens. Reads are reused within the workspace snapshot;
  authoritative revalidation discards that reuse, including after history-only
  writes. History failures and retries stay local to the history panel.
- Optional recurring maintenance stores an interval and an explicit next due
  date. Completing regular maintenance advances the due date from the actual
  completion date; disabling the schedule does not remove history.
- `equipment_service_events` is append-oriented history for regular maintenance,
  repair, and upgrade. Atomic RPCs coordinate the single open service event with
  the equipment `in_service` lifecycle; return explicitly selects Active or Spare.
- The admin-only `/office/equipment` workspace provides Inventory, Workstations,
  and Maintenance. Inventory includes every item, with category, type, lifecycle,
  location, and search filters; compact rows add type-specific computer or model
  summaries and maintenance urgency without repeating empty values. Office
  equipment is grouped by existing types.
  Workstation bulk creation always exposes optional employee assignment in each
  numbered row while preserving atomic creation and assignment uniqueness.
  Workstations also provides Cards and Floor plan views. The floor plan renders
  the two repository-owned architectural SVGs without modifying them and stores
  normalized, viewport-independent placements separately in
  `office_floor_plan_placements`. Only Office workstations and independently
  locatable office equipment (air conditioners, printers, coffee machines, and
  Other) are eligible; Remote workstations and attached component/peripheral
  inventory remain outside the spatial layer.
  Maintenance defaults to operational attention and can show all items to access
  schedules/history even when nothing is due. Workstation details group
  computers, monitors, and peripherals while keeping every attached device as
  an independent equipment row. Workstation name and employee changes autosave;
  renumbering and deletion remain explicit secondary actions. Opening attached
  equipment stacks its drawer over the mounted workstation drawer.
- Server Actions use the caller-context Supabase client after resolving the
  active studio administrator. Equipment can be attached, detached, or moved by
  updating its nullable workstation relationship; lifecycle changes do not
  delete retired inventory.
- Layout editing is administrator-only. A guarded atomic RPC replaces the
  studio's placement snapshot so floor changes, moves, and removals cannot save
  partially; removing a placement never changes or deletes the underlying
  workstation or equipment row. Placement display metadata stores bounded
  marker dimensions and quarter-turn rotation without changing equipment or
  workstation business data. The editor uses a logical grid, nearby-object
  anchors, and explicit floor-specific wall guides; it does not infer walls
  from the flattened architectural SVG paths.

Canonical paths: `src/app/(app)/office/equipment/`,
`src/components/office/equipment-workspace.tsx`,
`src/data/queries/equipment.ts`, the equipment migrations, and focused
Equipment application/RLS tests. See [Equipment reference catalog](equipment-catalog.md)
for local search boundaries, category mapping, historical retention and sync operations.

## Payroll lifecycle

Finance owns compensation privately. Member removal and profile deactivation stop
future payroll generation from the next service month; existing and earned
obligations remain. Restoring access does not restart compensation. See
[Finance](finance.md) for explicit schedule renewal and settlement.

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
| CRM Lead follow-up | Responsible administrator; CRM Lead |
| Equipment maintenance upcoming / overdue | Every active studio administrator; Equipment |

Invariants:

- `notifications` rows are created through private database helpers/triggers;
  callers do not author arbitrary recipient messages.
- Producers persist a semantic notification type plus structured metadata for
  system-generated values. The header translates that copy at render time while
  preserving user-authored names and text unchanged.
- The actor is not notified of their own action, and inactive recipients are
  skipped.
- A recipient may select their own rows and change only `read_at`; notifications
  cannot be marked unread or have content/identity changed.
- Header queries return the latest 30 items and a separate exact unread count.
- The authenticated header subscribes only to new recipient-scoped inserts.
  Session timestamps and notification IDs suppress historical/reconnected
  duplicates; accepted inserts also merge into the persistent center state.
- Up to three transient, localized toasts reuse the notification `href`, dismiss
  after about five seconds, and never mark the notification read. Popup and
  subtle Web Audio feedback are independently controlled by profile preferences;
  blocked audio playback is ignored.
- Mark-one and mark-all operations constrain updates to the authenticated
  recipient.
- Pending Administration counts and notification unread counts are different
  concepts.
- A protected daily Vercel cron calls the idempotent equipment-maintenance
  notification RPC. Per-cycle due-date markers deduplicate upcoming and overdue
  thresholds and reset when a new due date is established.
- Email, Web Push, service workers, and background delivery are not implemented.

Canonical paths: `src/data/queries/notifications.ts`,
`src/components/layout/notification-bell.tsx`, `src/app/api/notifications/`, and
notification-producing migrations.
