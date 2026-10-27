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
| `project_task_stage_columns` | Per-project stage labels/order/visibility, allowed workflow columns, stage kind/weight, and task-progress method. |
| `project_templates`, `project_template_tasks` | Reusable project/task creation structure and defaults. |
| `project_activity` | Immutable, safe, project-scoped change feed. |
| `tasks` and related tables | Delivery work; see [tasks.md](tasks.md). |

## Lifecycle

| State | Operational meaning |
| --- | --- |
| `planned` | Setup or future work. Qualifying work-stage tasks can activate it automatically. |
| `active` | Participates in normal workload, deadlines, and risk signals. |
| `paused` | Data is retained but removed from operational risk/work queues. |
| `completed` | Production stages are closed and metadata is read-only; additional-stage work may continue. |
| `archived` | Read-only retained record outside the active portfolio. |

Invariants:

- The database activates a planned project when a work-stage task enters In
  progress, Internal review, Client review, or Done.
- The client helper `getAutomaticProjectStatus()` mirrors the database trigger
  for optimistic project activation, including Internal review.
- Pause, completion, reopening, return to planned, archive, and restore are
  explicit lifecycle operations, not generic project-form edits.
- Completion requires all non-cancelled work-stage tasks to be closed.
  Additional-stage tasks do not block project completion.
- Returning a paused project to planned is allowed only when no eligible
  production task has progressed beyond To do.
- Reopening a completed project clears its completion date.
- Administrators may correct a completed project's authoritative `completed_at`
  date without replaying a lifecycle transition or reopening the project. Moving
  it earlier clamps only later completed work-stage task dates to the same date;
  additional-stage and already-earlier task dates remain unchanged.
- Restoring an archived project returns it to completed when it retains a
  completion date; otherwise it returns to paused.
- Completed project metadata and production-stage tasks are read-only. New or
  existing additional-stage tasks may remain writable without reopening.

## Creation and metadata

- Project creation is a modal on `/projects`; `/projects/new` is a compatibility
  redirect. Editing and CRM Lead conversion reuse the shared project form.
- A Project may be linked to at most one CRM Lead. Lead conversion extends the
  normal template-aware creation RPC so Project creation, Lead linking, and the
  Lead's Won transition either all succeed or all roll back.
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
- A project-template task may reference one same-studio checklist template. Project
  creation and stage application copy its current items into task checklist rows;
  created projects do not retain template links.
- Administrators may also append one non-empty stage from an active same-studio
  template to any enabled, writable destination stage. This cross-stage mapping
  preserves the destination stage configuration and every existing task; it does
  not replace or deduplicate stage work.
- A template task may also specify expected working days. A scheduled task can
  follow the immediately previous task in its stage (the editor default), be
  independent, or name earlier scheduled tasks as custom direct predecessors.
  The order-following mode changes its effective predecessor on reorder; redundant
  transitive custom edges are rejected. Stage application accepts an optional
  start-date anchor; existing unscheduled templates remain usable without one.
- Project stages use stable legacy keys `stage_1`–`stage_4` and project-owned
  `custom_<uuid>` keys. Kind (`work`/`additional`) is immutable after creation;
  labels/order/visibility and positive integer progress weights are configurable.
  Templates retain their four canonical source stages. Initial kinds are work
  for Stage 1–3 and additional for Stage 4.
- `update_project_stage_configuration` atomically saves an expected configuration
  version. `get_project_stage_configuration` reads rows and version in one snapshot.
  Removal deletes tasks only when every current task is Todo and has no work-log
  entries; the confirmed task-ID set must still match. Stage rows become tombstones
  to preserve historical/financial labels. At least one visible stage must remain.
- `projects.show_progress` defaults to true and controls only the project summary
  and board stage progress display; completion and lifecycle calculations continue.

## List presentation

The server loads the RLS-visible portfolio and calculates progress and health.
Portfolio inputs and detail task reads use stable pagination within the Data API
row cap. List, non-board detail views, and the live board use the shared
`calculateProjectSummary()` result: task counts include all stages except
cancelled tasks; overall progress normalizes the weights of all non-deleted work
stages, including hidden ones. The live board publishes its computed summary to the project header, and stage progress methods
are shared workspace state. No project-summary percentage is persisted or server-cached;
legacy `project_area_progress` is not a summary input.
Lifecycle, health, priority, and sort URL parameters filter/order that presented
collection in the client using the canonical list helpers. Filter changes replace
the current history entry without reloading the dataset; direct URLs and
Back/Forward restore the controls and list. Project links carry those parameters
through the project workspace so its Projects return link and reloads preserve
the selected list; creation still uses normal server navigation.

The measured cached-first warm-return benefit required the experimental
`unstable_dynamicStaleTime` page override; it is excluded from the release.
Ordinary Projects returns use fresh server navigation with the accepted streaming
blueprint/reveal. Next's default back/forward history reuse remains guarded by a
read-only authenticated user/studio/role/membership/RLS scope check before private
content is revealed, followed by a committed refresh. Server-render IDs distinguish
fresh server data from retained history, avoiding duplicate checks/refreshes on
ordinary visits. There is no separate client data cache or browser payload storage.
Projects links keep speculative prefetch disabled: the pilot increased traffic and
cold latency, while Next 16.2 full prefetch omits its identifying request header.
Tagged speculation skips schedule maintenance and shared-layout timer synchronization.
Project/task Server Actions revalidate `/projects`; lifecycle API controls also
refresh the router. No experimental page-cache configuration is enabled.

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

## Project Finance

Administrators have a `view=finance` tab alongside Board, Details, Team and
Activity. Finance owns agreements, flexible expected payments, supervision and
contractor bonus income; see [finance.md](finance.md). It never depends on
production stages or copies the CRM lead budget. Completion/archive keeps Finance
writable for collections. Operational lifecycle changes do not settle, cancel,
or stop financial arrangements. Financially referenced projects cannot be deleted.
Finance private amendments never enter the ordinary project activity feed.

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
