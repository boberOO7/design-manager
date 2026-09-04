# StudioFlow architecture decisions

- Use Next.js 16 App Router, React, TypeScript, Tailwind and pnpm.
- Use Supabase PostgreSQL, Auth, SSR clients and RLS.
- Prefer Server Components unless browser APIs, hooks or local interaction
  require a Client Component.
- Keep browser and server Supabase clients separate.
- Use one canonical server-side source for the authenticated Profile.
- Never use mock identity for authentication or authorization.
- Replace mock business data incrementally, one functional area at a time.
- Treat RLS as the actual authorization boundary.
- UI visibility alone must never be treated as authorization.
- Never expose the Supabase service-role key to browser code.
- Do not edit migrations that have already been applied remotely.
- Create a new migration for every later schema or RLS change.
- Do not push migrations or modify remote data without explicit confirmation.
- Preserve the current visual design unless a redesign is specifically requested.
- StudioFlow uses a shared typed semantic color system for badges and compact status surfaces. Green is reserved for positive, active, and success states; task priority follows Low neutral, Normal blue, High amber, and Urgent red.
- Coworker Calendar availability displays the employee name plus the fixed generic label “Out of office”. Request type, private notes, review notes, and other sensitive time-off details remain restricted to authorized owner/admin detail views.

- Dashboard content is role-specific: admins receive studio-wide operational
  visibility while employees receive personal work priorities. It remains
  read-only apart from the established task-status interaction; advanced
  analytics and leaderboard metrics are deferred.

## Project task progress and health

- Automatic task progress follows the current workflow column: To do 0%,
  In progress 0% on a first pass (70% when returned from either review or
  Done), Internal review 80%, Client review 90%, and Done 100%. Status-derived
  progress is persisted through the task status trigger, so it remains correct
  after refresh and applies equally to the board, form, API, and bulk moves.
- In-progress tasks without checklist items retain their intentional manual
  production fallback. An explicit manual override is persisted separately and
  is not overwritten by later status changes; it maps production proportionally
  into the first 70% of task progress. A non-empty checklist still replaces the
  manual production display with completed checklist weight divided by total
  checklist weight. Presentation rounds to the nearest whole percent only after
  aggregation while domain calculations retain precision.
- Progress flows from canonical task progress to stage progress and then to the
  overall project result. Each of Stages 1–3 uses its own Equal, Area, or
  Weighted aggregation method over its non-cancelled task progress; Stage 4 has
  no progress-method setting. Overall project progress is fixed: Stage 1
  contributes 20%, Stage 2 40%, and Stage 3 40%; Stage 4 never contributes.
  Stage percentages and the combined result are rounded only for presentation.
- `completed_area_m2` is the canonical task-area allocation for
  completion-time productivity attribution. Productivity remains an immutable
  snapshot; later task edits do not rewrite historical credit.
- Project health is derived rather than stored, using deterministic lifecycle,
  deadline, overdue-task, and open-priority rules.
- Employee contribution is informational task progress only, not a performance
  score or ranking.

## Productivity attribution

- Productivity uses immutable attribution rows created by completion transitions,
  rather than `updated_at` or mutable completion dates. Reopening voids the active
  row and recompleting creates one fresh row from the original task productivity
  snapshot, so current-month totals never double count or reserve stage budget twice.
- Task productivity snapshots use stable stage IDs: Stage 1 reserves 20% and Stage
  3 reserves 80% of the project-area snapshot in a per-project-stage budget; Stage
  2 snapshots its task area. Stage budget allocations divide only remaining budget
  among non-cancelled unsnapshotted tasks, preserving earlier values when tasks or
  project area later change.
- Whole-project fallback credit is superseded by stage productivity snapshots and
  is no longer created. Existing fallback rows remain audit history but are voided
  from active leaderboard totals during the stage-accounting backfill. Contributor
  name and professional role remain snapped for auditability after membership changes.
- The Leaderboard is a quiet current-month Europe/Kyiv productivity projection of
  active attribution rows, ordered by credited area, task count, name, then ID.
- Attribution source and contributor identifiers are snapshots rather than task,
  project-member, or profile foreign keys. Hard-deleting a task or project does
  not remove completed-work history; deleting a studio remains the intentional
  tenant-wide deletion boundary.
- Project-level productivity inclusion is a live leaderboard area filter.
  Toggling it excludes or restores that project’s production-stage attribution
  rows in monthly, quarterly, and yearly rankings without rewriting snapshots,
  budgets, or attribution history. Stage labels, ordering, and visibility are
  presentation configuration only; stable stage IDs remain the policy inputs.
- Post-completion-stage task completions create a task-count ledger event with
  zero credited area and never materialize a task productivity-area snapshot.

## Project lifecycle workflow

- Project lifecycle is stored, with one-way automatic activation when a planned
  project task enters in-progress, review, or completed work.
- Pausing, completing, and reopening remain explicit administrator decisions;
  project status is managed through lifecycle actions rather than Edit Project.
- Completing a project submits directly without a client confirmation; existing
  server validation and lifecycle feedback remain the eligibility boundary.
- Completed projects require all production-stage tasks closed. Post-completion
  stage work remains creatable and writable without reopening the project. The
  shared creation form exposes only canonical post-completion stages in that
  state; production-stage tasks and project metadata remain read-only.

## Structured project creation metadata

- Project creation is a compact, URL-preserving modal on the Projects list. The
  legacy `/projects/new` route redirects to `/projects`; editing continues to use
  the same shared form implementation.
- `start_date` is the user-editable planned start of project work. New projects
  default it to the current `Europe/Kyiv` calendar date, and lifecycle activation
  never rewrites it.
- Project codes are immutable UI references generated in PostgreSQL as
  `SPACE_{YEAR}_{NNN}` from a private studio/year counter. Allocation is atomic,
  existing manual codes remain valid, and codes are unique within a studio.
- Project types store canonical language-neutral keys. Existing legacy values
  remain readable until an administrator explicitly selects a canonical value.
- Project countries store required ISO 3166-1 alpha-2 codes and default existing
  and new records to `UA`. Country names are localized at presentation time.
- City names remain text. GeoNames suggestions are fetched only through a
  server-side provider using `GEONAMES_USERNAME`, with country filtering and
  short caching; manual city entry remains available when lookup is unsuitable.

## Project archive lifecycle

- Archived projects use `status = archived` and retain their project data.
- Restoring an archived project with an existing `completed_at` date returns it
  to `completed`.
- Restoring any other archived project returns it to `paused`.

## Roles and permissions

- `system_role` controls application access and is currently either
  `admin` or `employee`.
- All non-admin employees initially have the same application permissions.
- `job_title` is the person's stable professional role and does not grant
  application permissions.
- `project_members` represents assignment to a project. Per-project role
  selection is not exposed in the MVP; the required database role is supplied
  by the server.
- More granular permission roles are deferred until they are actually needed.

## Calendar

- Calendar combines manually managed studio/project events, employee time-off,
  and live project/task deadline projections in one normalized UI model.
- Project deadlines remain canonical date-only fields on `projects`; task
  deadlines are normalized in `task_deadlines`, one per canonical workflow
  milestone. Surfaces resolve only the next unreached milestone deadline;
  Calendar never copies either deadline type into event rows. Task deadlines
  are hidden by default to keep dense Month views readable.
- Time-off request types, private notes, review notes, pending requests, and
  rejected requests are visible only to the requesting employee and active
  studio administrators. Coworkers receive only approved dates/times, display
  name, and the fixed label “Out of office” through a dedicated safe RPC.
- Timed events are stored as absolute `timestamptz` values and displayed in the
  StudioFlow application timezone (`Europe/Kyiv`). Project/task deadlines and
  time-off ranges retain date-only semantics; partial time off is a same-day
  local wall-time interval.
- Month view renders eligible multi-day all-day items as deterministic,
  week-local grid segments, reserving compact space only for lanes in use.
  Week uses the same all-day concepts plus a Europe/Kyiv hourly time grid;
  timed overlaps receive deterministic horizontal columns and the current-time
  indicator updates locally once per minute.
- Calendar keeps its desktop Month geometry and seven-day Week grid intact on
  narrow screens. Month uses its existing compact chronological representation
  below the desktop breakpoint; Week remains horizontally scrollable with a
  visible mobile instruction, a stable hour gutter, and an initial current-day
  position when applicable. Calendar controls wrap into purposeful groups and
  mobile drawers retain near-full-width, scrollable forms with reachable action
  footers.
- New project events are limited to planned, active, and paused projects.
  Completed projects must be reopened before receiving a new event; existing
  historical events remain readable and cancellable. Archived projects cannot
  receive events.
- Google Calendar remains a one-way projection of real `calendar_events` into
  each connected user's dedicated secondary `{studioName} Team` calendar. A
  connection always creates a fresh calendar by exact persisted ID; disconnect
  deletes that calendar before revoking authorization and removing local
  connection state. Both automatic event-scoped reconciliation and manual full repair
  use the exact Calendar `Relevant to me` business predicate; RLS visibility
  alone is not synchronization relevance. Calendar, invitation, participant,
  assignee, cancellation, and recurrence writes enqueue one coalescing database
  outbox row per root event in the same transaction. Post-response workers and a
  protected scheduled drain process it with bounded retry, while revoked Google
  credentials mark the connection for reconnection without failing StudioFlow
  writes. Google-to-StudioFlow sync, synthetic Calendar items, attendees,
  reminders, public holidays, and other external calendars remain deferred.

## Administration

- Administration is the primary administrative action queue for time-off decisions,
  upcoming team availability, and compact Team/access context; it does not duplicate
  the operational Dashboard.
- Calendar remains a contextual approval surface. Both surfaces use the same
  time-off Route Handler workflow and normalized response model.
- Request history is limited to time-off decisions until a general Activity History
  system exists.
- Administration presents pending time-off as the dominant operational queue;
  upcoming availability is supporting context and recent decisions are quiet,
  non-actionable history. All three continue to use the same authorized request model.

## In-app notifications

- Notifications are persistent, recipient-private, and event-driven in the MVP.
- Scheduled deadline reminders require a later reliable scheduler milestone; email, push, and real-time subscriptions are not part of this milestone.
- Notification content excludes private time-off and review notes. Administration notification unread counts and pending-request counts remain separate concepts.
- Notification links reuse the existing task, Calendar, and Administration drawers.

## Office operations

- Office is the home for internal studio operations outside project production. It contains a role-aware overview, submissions, and standalone office assignments.
- Submissions retain their dedicated privacy and workflow model under `/office/submissions`; the legacy `/submissions` route redirects without repurposing historical project data.
- The submissions surface is an active-first operational inbox with terminal records separated into History. Primary actions follow the canonical type workflow; rejection remains a separate administrator action. Starting request work requires an active responsible studio member, and assignment plus transition stays atomic through the existing management RPC.
- Submission priority is always present and defaults to Normal, matching the task convention. Anonymous complaints retain no author identity and expose neither participant assignment nor communication UI.
- Office assignments use the fixed `assigned → in_progress → done` workflow with administrator-only cancellation. Administrators create and manage them; only administrators and the assigned active member can read them.
- Office records have no project, task, productivity, area, progress, or Rating relationship. Aggregation across submissions and assignments is presentation-only.

## Project Activity History

- Activity History is an immutable, project-scoped audit feed: it has no recipient,
  delivery, or unread/read state and remains available after viewing.
- Activity access follows the existing project visibility boundary. It records only
  safe change metadata (states, priority, assignee identifiers, dates, and project
  member assignment fields), never task descriptions, notes, or other free text.
- History starts at migration deployment; earlier project changes are not backfilled.

## Project-member write authorization

- Private, narrowly scoped security-definer helpers resolve a project's studio
  for project-member write policies without recursively invoking
  `project_members` RLS.
- New assignments receive a server-owned assignment date and start with zero
  assigned area; workload allocation remains deferred.

## Task board MVP

- The project Board is the primary project workspace, with Details and Team as
  compact secondary views on the existing project route.
- Project tasks use a five-column workflow: To do, In progress, Internal review,
  Client review, and Done. The existing `review` database status is the Client review column;
  cancelled tasks remain visible in Done without changing stored status. Task
  cancellation is not an exposed mutation for either administrators or assigned
  employees; this milestone does not add a cancellation workflow.
- Active studio administrators create tasks and assign them to people who are
  already active members of that exact project.
- Assigned employees may update the status and in-progress production of their
  own tasks and may manage their To do/In progress checklist. Administrators may
  do the same for tasks they manage. Task rows and checklist rows remain
  protected by Route Handler checks, RLS, column privileges, and database
  transition guards.
- Checklist items are lightweight weighted stages with only title, completion,
  weight, and deterministic order. They are not subtasks: they have no assignee,
  deadline, status, comments, notifications, My Tasks presence, drawer, or
  children. Position is assigned at insertion and is immutable afterward; no
  checklist reorder UI or mutation is part of this milestone. Moving a task to
  Client review atomically completes its remaining checklist items and normalizes
  production to 100%; Done still requires the checklist already be complete.
- Project Board task status changes use whole-card drag-and-drop. Pointer drags
  start only from non-interactive card areas, and database writes occur only
  after a completed drop into a different workflow column.
- Manual ordering within a status column is not persisted. Rejected optimistic
  moves restore the previous task and project state and announce the reason.
  My Tasks keeps its compact status control and the shared task drawer.

## Employee invitation and onboarding

- Employees are invited by an authenticated, active administrator of the
  current studio. There is no public self-registration flow in StudioFlow.
- Every newly invited user receives `employee` application access. The browser
  cannot choose a system role or studio membership.
- `job_title` records the employee's stable professional position; it does not
  grant application permissions.
- An invitation creates active membership only in the inviting administrator's
  current studio. It does not create a `project_members` assignment.
- Employees see projects only after an administrator assigns them through
  `project_members`, with project visibility enforced by RLS.

## UI foundation

- Localization uses `next-intl` with centralized typed `en`/`uk` configuration.
  URLs remain unprefixed; the server resolves the locale from the `studioflow-locale`
  cookie, falling back to the browser's Accept-Language and then English. The
  persistent shell selector writes that cookie and refreshes the current route,
  preventing a wrong-language first render or hydration mismatch. Messages use
  stable feature namespaces, and locale-aware date/number formatting receives
  the active locale explicitly. Cross-device profile persistence is deferred.

- StudioFlow follows a “Quiet architectural operations system” direction: a warm
  stone-neutral foundation, restrained professional hierarchy, compact
  operational density, and no decorative gradients, glass effects, or motion.
- Geist is the sole application UI typeface, with sensible system sans-serif
  fallbacks. Numeric metrics, dates, times, areas, and counters use tabular
  figures where appropriate.
- The spacing rhythm is based on 4px and 8px increments. Standard panels use a
  12px radius, controls use an 8px radius, and larger radii are reserved for
  drawers and intentional prominent surfaces.
- Borders are the primary method for separating surfaces. Panel shadows are
  restrained and must not be stacked between nested surfaces.
- Lightweight shared primitives provide panels, form fields, inputs, segmented
  controls, empty states, and drawers. Product pages adopt them incrementally;
  the foundation is not a separate generic design-system framework.
- Primary hierarchy uses charcoal, information uses blue, success uses emerald,
  warning uses amber, danger uses red, and lifecycle completion/review uses
  violet. Amber is not a generic decorative color. Unread notifications use the
  established charcoal indicator rather than an amber background treatment.
- Mobile navigation and all modal drawers must be keyboard-operable: labelled,
  focus-trapped while open, dismissible with Escape and backdrop click where
  safe, and return focus to their trigger when closed. They must prevent
  background interaction and provide visible focus states and comfortable touch
  targets.
- Drawers share one accessibility contract: dialog labelling, focus trap, scroll
  lock, Escape/backdrop dismissal when safe, a close control, and return focus
  to the trigger or a stable fallback after mutation. Pending and unsaved-change
  workflows retain their existing close protection.
- Related in-page panels use tabs only when they expose tab panels; local modes
  and filters use segmented buttons with pressed state. Task cards are native
  buttons: click/Enter opens details, while eligible cards retain whole-card
  pointer and keyboard drag behavior without nested interactive controls.
- Dashboard presentation is priority-led rather than card-grid-led. Each role
  begins with one compact metric strip, then a dominant attention queue; admin
  workload remains operational context rather than employee scoring. Supporting
  Dashboard information uses quieter bordered lists, and empty Dashboard states
  stay compact rather than creating oversized panels.
- Desktop Projects uses an operational list while mobile retains responsive
  project cards. Project health and lifecycle remain separate signals, projects
  without eligible tasks show “No tasks yet” rather than a misleading progress
  bar, and default ordering prioritizes operational risk.
- Authenticated pages expose a skip link and one stable main landmark. Mobile
  controls target roughly 44px hit areas. Calendar event labels include the
  event title and applicable date/time/location; current-time decoration is not
  a keyboard stop. Reduced motion never delays focus or functionality.
