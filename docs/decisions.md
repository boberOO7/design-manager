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

- Dashboard content is role-specific: admins receive studio-wide operational
  visibility while employees receive personal work priorities. It remains
  read-only apart from the established task-status interaction; advanced
  analytics and leaderboard metrics are deferred.

## Project task progress and health

- Project progress is derived from non-cancelled tasks as completed eligible
  tasks divided by all eligible tasks; cancelled tasks are excluded.
- Project health is derived rather than stored, using deterministic lifecycle,
  deadline, overdue-task, and open-priority rules.
- Employee contribution is informational task progress only, not a performance
  score or ranking.

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

## In-app notifications

- Notifications are persistent, recipient-private, and event-driven in the MVP.
- Scheduled deadline reminders require a later reliable scheduler milestone; email, push, and real-time subscriptions are not part of this milestone.
- Notification content excludes private time-off and review notes. Administration notification unread counts and pending-request counts remain separate concepts.
- Notification links reuse the existing task, Calendar, and Administration drawers.

## Project-member write authorization

- Private, narrowly scoped security-definer helpers resolve a project's studio
  for project-member write policies without recursively invoking
  `project_members` RLS.
- New assignments receive a server-owned assignment date and start with zero
  assigned area; workload allocation remains deferred.

## Task board MVP

- The project Board is the primary project workspace, with Details and Team as
  compact secondary views on the existing project route.
- Project tasks use a three-column workflow: To do, In progress and Done.
  Existing `review` tasks appear in In progress and existing `cancelled` tasks
  appear in Done without changing their stored database status.
- Active studio administrators create tasks and assign them to people who are
  already active members of that exact project.
- Assigned employees may update only the status of their own tasks. Task row
  access and every write remain protected by RLS and column-level privileges.
- Project Board task status changes use whole-card drag-and-drop. Pointer drags
  start only from non-interactive card areas, and database writes occur only
  after a completed drop into a different workflow column.
- Manual ordering within a status column is not persisted. Task authorization
  remains enforced by the existing Server Action and RLS, while My Tasks keeps
  its compact status control.

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
