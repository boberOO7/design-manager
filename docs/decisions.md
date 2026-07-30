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
- StudioFlow uses a shared typed semantic color system for badges and compact status surfaces. Green is reserved for positive, active, and success states; Normal priority remains neutral.
- Coworker Calendar availability displays the employee name plus the fixed generic label “Out of office”. Request type, private notes, review notes, and other sensitive time-off details remain restricted to authorized owner/admin detail views.

- Dashboard content is role-specific: admins receive studio-wide operational
  visibility while employees receive personal work priorities. It remains
  read-only apart from the established task-status interaction; advanced
  analytics and leaderboard metrics are deferred.

## Project task progress and health

- Task progress separates production completion from client approval. To do is
  0%, In progress is production completion × 80%, Client review is 80%, and
  Done is 100%. Cancelled tasks are excluded from project aggregation.
- In-progress tasks without checklist items use a stored manual production
  percentage. A non-empty checklist replaces that percentage with completed
  checklist weight divided by total checklist weight; deleting the final item
  restores the stored manual fallback. Presentation rounds to the nearest whole
  percent only after aggregation while domain calculations retain precision.
- Project progress has one explicit method: Equal weights every included task as
  1; Area weights the existing task `completed_area_m2` allocation against the
  project `total_area_m2` design scope so unallocated scope remains unfinished;
  Weighted uses each task's positive explicit `progress_weight`. Area and
  arbitrary weights are never combined in one formula.
- `completed_area_m2` is the canonical task-area allocation for both Area
  progress and completion-time productivity attribution. Productivity remains
  an immutable snapshot; later task edits do not rewrite historical credit.
- Project health is derived rather than stored, using deterministic lifecycle,
  deadline, overdue-task, and open-priority rules.
- Employee contribution is informational task progress only, not a performance
  score or ranking.

## Productivity attribution

- Productivity uses immutable attribution rows created by completion transitions,
  rather than `updated_at` or mutable completion dates. Reopening voids the active
  row and recompleting creates one fresh row, so current-month totals never double
  count.
- A completed task with a positive `completed_area_m2` credits its completion-time
  assignee for that exact snapshot. Later reassignment or area edits do not rewrite
  historical credit.
- On project completion, fallback credit is created only when no task on that
  project has any task-level area allocation. Each active project member who is
  also an active studio member receives the whole project area; partially allocated
  projects receive no fallback. Contributor name and professional role are snapped
  to preserve auditability after membership changes.
- The Leaderboard is a quiet current-month Europe/Kyiv productivity projection of
  active attribution rows, ordered by credited area, task count, name, then ID.
- Attribution source and contributor identifiers are snapshots rather than task,
  project-member, or profile foreign keys. Hard-deleting a task or project does
  not remove completed-work history; deleting a studio remains the intentional
  tenant-wide deletion boundary.

## Project lifecycle workflow

- Project lifecycle is stored, with one-way automatic activation when a planned
  project task enters in-progress, review, or completed work.
- Pausing, completing, and reopening remain explicit administrator decisions;
  project status is managed through lifecycle actions rather than Edit Project.
- Completed projects require all tasks closed and remain read-only until an
  administrator reopens them.

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
- Project and task deadlines remain canonical date-only fields on their
  original tables; Calendar never copies them into event rows. Task deadlines
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
- Recurring events, reminders, public holidays, and Google/Outlook or external
  calendar synchronization are deferred.

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
- Project tasks use a four-column workflow: To do, In progress, Client review,
  and Done. The existing `review` database status is the Client review column;
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
  checklist reorder UI or mutation is part of this milestone. A task cannot enter
  Client review or Done with incomplete items.
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
