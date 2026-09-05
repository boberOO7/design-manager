# Tasks

## Boundary

Tasks are project-owned work items. A task has one stable project stage, one
workflow status, an optional assignee, optional collaborators, milestone
deadlines, and an optional weighted checklist. Current task state drives project
progress; qualifying completion drives immutable productivity attribution.

## Stages and workflow

Stable stages are `stage_1` through `stage_4`. Stage 1–3 are production stages;
Stage 4 is operationally independent post-completion work.

| Board column | Stored status | Automatic overall progress |
| --- | --- | --- |
| To do | `todo` | 0% |
| In progress | `in_progress` | 0% on first pass; 70% when returned from review or Done |
| Internal review | `internal_review` | 80% |
| Client review | `review` | 90% |
| Done | `completed` | 100% |

`cancelled` remains a stored terminal status and is rendered with Done where
encountered, but the normal task UI does not expose task cancellation.

Each project stage may expose only a configured subset of columns. A status
change is valid only when its destination is enabled for that task's stage.

## Authorization and mutation invariants

- Active studio administrators create tasks and manage eligible task details.
- Assignees may change status, in-progress production, and eligible checklist
  items on their own tasks. Collaborators do not receive assignee mutation rights.
- Assignees and collaborators selected by an administrator must be active members
  of the same project. Tasks may be unassigned.
- Archived-project tasks are read-only. On completed projects, Stage 1–3 tasks
  are read-only while Stage 4 tasks remain creatable and writable.
- Task detail edits and collaborator replacement use one RPC to avoid partial
  membership or assignment state.
- Bulk status and stage-assignment operations use guarded RPCs and are
  administrator workflows.
- Completing productivity-bearing work requires an eligible active project
  member when an assignee is present.
- Status changes revalidate Projects, Dashboard, My Tasks, and Leaderboard;
  deadline or Calendar-facing changes must also refresh their consumers.

## Progress

- Status-derived progress is persisted by a database trigger so it is consistent
  across the board, forms, APIs, bulk moves, and refreshes.
- In-progress work without checklist items may use manual production from 0–100.
  It maps proportionally into the first 70% of overall task progress.
- An explicit manual override is stored separately and survives later status
  transitions.
- A non-empty checklist replaces the manual production display: completed
  checklist weight divided by total checklist weight determines production.
- Calculations retain precision; presentation rounds only after aggregation.
- `completed_area_m2` is task-area allocation and an input to area progress and
  completion-time productivity rules. It is not the legacy project-area log.

Project aggregation and attribution are described in
[productivity.md](productivity.md).

## Checklists

- Checklist items contain title, completion, weight, and deterministic position.
- They are progress stages, not subtasks: no assignee, status, deadline, comments,
  notifications, child items, drawer, or My Tasks entry.
- Checklist editing is allowed only while the task is To do or In progress.
- Position is assigned on insertion and not user-reorderable.
- Moving to Client review atomically completes remaining checklist items and
  normalizes production. Moving to Done requires the checklist already complete.
- Studio checklist templates may seed a task's items during creation.

## Milestone deadlines

- `task_deadlines` stores at most one deadline for each canonical review/done
  milestone supported by the task-details RPC.
- Surfaces resolve the next unreached milestone as the active task due date.
- Task milestone deadlines project live into Calendar; Calendar does not copy
  them into `calendar_events`.
- Legacy `tasks.due_date` remains in the generated shape and some migration
  compatibility paths. New behavior should use the milestone model deliberately.

## Board interaction

- The project Board is the primary task workspace. Details and Team remain
  secondary project views; My Tasks uses the same task drawer.
- Whole-card pointer and keyboard drag moves status. Database writes occur only
  after a completed drop into a different column.
- Manual ordering within a status column is not persisted.
- Rejected optimistic moves restore prior task/project state and surface the
  failure.

## Canonical sources

- `src/types/tasks.ts`
- `src/lib/task-stages.ts`
- `src/lib/task-workflow.ts`
- `src/lib/task-deadlines.ts`
- `src/lib/checklist-autosave.ts`
- `src/lib/task-collaborators.ts`
- `src/lib/validation/task.ts`
- `src/data/queries/tasks.ts`
- `src/data/mutations/task-status.ts`
- `src/data/mutations/task-progress.ts`
- `src/data/mutations/task-edit.ts`
- `src/app/(app)/projects/[projectId]/task-actions.ts`
- `src/app/api/tasks/` and project bulk-task Route Handlers
- Task, checklist, collaborator, deadline, stage, and progress migrations in
  `supabase/migrations/`
