# Projects

## Boundary

A project is the tenant-scoped container for delivery work. It owns membership,
task stages, tasks, deadlines, progress configuration, lifecycle state, and
activity history. Project health is derived and must not be confused with
lifecycle or progress.

## Key entities

| Entity | Responsibility |
| --- | --- |
| `projects` | Identity, client/location metadata, area, priority, lifecycle, dates, productivity inclusion. |
| `project_members` | Active employee assignment to a project. |
| `project_task_stage_columns` | Per-project stage labels/order/visibility, allowed workflow columns, and Stage 1–3 progress method. |
| `project_templates`, `project_template_tasks` | Reusable project/task creation structure and defaults. |
| `project_activity` | Immutable, safe, project-scoped change feed. |
| `tasks` and related tables | Delivery work; see [tasks.md](tasks.md). |

## Lifecycle

| State | Operational meaning |
| --- | --- |
| `planned` | Setup or future work. Qualifying Stage 1–3 work can activate it automatically. |
| `active` | Participates in normal workload, deadlines, and risk signals. |
| `paused` | Data is retained but removed from operational risk/work queues. |
| `completed` | Production stages are closed and metadata is read-only; Stage 4 work may continue. |
| `archived` | Read-only retained record outside the active portfolio. |

Invariants:

- The database activates a planned project when a Stage 1–3 task enters In
  progress, Internal review, Client review, or Done.
- The client helper `getAutomaticProjectStatus()` mirrors the database trigger
  for optimistic project activation, including Internal review.
- Pause, completion, reopening, return to planned, archive, and restore are
  explicit lifecycle operations, not generic project-form edits.
- Completion requires all non-cancelled Stage 1–3 tasks to be closed. Stage 4
  does not block project completion.
- Returning a paused project to planned is allowed only when no eligible
  production task has progressed beyond To do.
- Reopening a completed project clears its completion date.
- Restoring an archived project returns it to completed when it retains a
  completion date; otherwise it returns to paused.
- Completed project metadata and production-stage tasks are read-only. New or
  existing Stage 4 tasks may remain writable without reopening.

## Creation and metadata

- Project creation is a modal on `/projects`; `/projects/new` is a compatibility
  redirect. Editing reuses the shared project form.
- Project codes are immutable UI references allocated atomically as
  `SPACE_{YEAR}_{NNN}` from a private studio/year counter. Manual legacy codes
  remain readable and codes are studio-unique.
- Canonical project types are language-neutral keys: private, commercial,
  HoReCa, medical, and other. Legacy stored values remain displayable.
- Country is a required ISO 3166-1 alpha-2 code and defaults to Ukraine. City is
  stored as text; server-side GeoNames suggestions are optional and manual entry
  remains valid.
- `start_date` is the planned start chosen by the user. New projects default to
  the current Europe/Kyiv date; activation does not rewrite it.
- Project lifecycle and project health are separate. Health is derived from
  completion, deadline, overdue tasks, urgent/high-priority open tasks, and the
  seven-day deadline window.

## Membership, templates, and stages

- Administrators assign only active members of the same studio.
- New project memberships receive a server-owned assignment date, database
  project-role fallback, and zero assigned area. User-selected project roles and
  workload allocation are not implemented.
- Removing a project member can require reassignment of that member's open tasks;
  the impact check and removal RPC keep this atomic.
- Project templates create the project, memberships, task structure, and defaults
  atomically. Template task priority and ordering are normalized by migrations.
- Every project has four stable stage IDs. Labels, ordering, visibility, allowed
  columns, and Stage 1–3 progress methods are configuration; stable stage IDs are
  policy inputs and must not be repurposed.

## Activity History

- Activity History starts at the migration that introduced it; older changes are
  not backfilled.
- It follows project visibility and has no recipient, delivery, unread, or read
  state.
- It records safe structured state such as lifecycle, priority, assignee IDs,
  dates, and membership changes. It intentionally excludes descriptions, notes,
  and arbitrary free text.
- Task deletion may make the current task title unavailable; the historical
  activity row remains.

## Canonical sources

- `src/app/(app)/projects/`
- `src/components/projects/`
- `src/data/queries/project-by-id.ts`
- `src/data/queries/project-members.ts`
- `src/data/queries/project-stage-columns.ts`
- `src/data/queries/project-templates.ts`
- `src/data/queries/project-activity.ts`
- `src/data/mutations/project-lifecycle.ts`
- `src/lib/project-lifecycle.ts`
- `src/lib/project-list-presentation.ts`
- `src/lib/validation/project.ts`
- Project, stage, template, membership, lifecycle, and activity migrations in
  `supabase/migrations/`
