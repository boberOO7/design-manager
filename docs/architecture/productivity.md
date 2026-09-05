# Productivity and progress

## Separate concepts

| Concept | Mutability | Purpose |
| --- | --- | --- |
| Task progress | Current | How far the task has moved through production and review. |
| Stage/project progress | Derived current state | Aggregation of eligible task progress. |
| Project health | Derived current state | Operational risk from lifecycle, deadlines, overdue work, and priority. |
| Productivity attribution | Immutable ledger with voiding | Historical credit created by completion transitions. |
| Leaderboard | Derived projection | Period view over active eligible attribution rows plus configured bonuses. |

Never derive historical productivity from `updated_at`, current task fields, or
current project membership.

## Project progress

- Only Stage 1–3 contribute. Stage 4 never contributes to project progress.
- Stage 1 contributes 20%, Stage 2 contributes 40%, and Stage 3 contributes 40%.
- Each production stage independently selects Equal, Area, or Weighted task
  aggregation through `project_task_stage_columns`.
- Cancelled tasks are excluded. Empty/zero-weight aggregations resolve to zero.
- Precision is retained in domain calculations; UI presentation rounds the final
  values.
- Project health is separate and derived, not stored.

See [tasks.md](tasks.md) for task-level progress rules.

## Attribution ledger

`productivity_attributions` is append-oriented audit history. Active totals use
rows without `voided_at`.

- A qualifying completion transition creates an attribution row from a stable
  snapshot.
- Reopening voids the active row. Recompletion creates one fresh row and does not
  double count or reserve a stage budget twice.
- Contributor ID, name, and professional title are snapshots. They are not
  foreign keys whose later deletion or membership change rewrites history.
- Task and project deletion do not erase completed-work history. Studio deletion
  is the tenant-wide deletion boundary.
- Whole-project fallback credit is legacy audit history and no longer created.
  Stage-accounting backfill voids fallback rows from active totals.

## Stage accounting

- Stable stage IDs are policy inputs. Labels, display order, visibility, and
  column configuration do not change accounting rules.
- Stage 1 reserves 20% and Stage 3 reserves 80% of the project-area snapshot in
  `project_stage_productivity_budgets`.
- Stage 2 snapshots the task's `completed_area_m2`.
- Stage budget allocation divides only remaining budget among non-cancelled,
  unsnapshotted tasks. Earlier snapshots survive later task or project-area edits.
- Unassigned productivity-bearing completion is allowed only where current
  database rules can safely create no contributor attribution; assigned work
  must resolve to an active project member.
- Stage 4 completions create a zero-area task-count ledger event and no task
  productivity-area snapshot.

## Leaderboard

- Periods are month, quarter, and year, bounded in `Europe/Kyiv`.
- Active rows are grouped by snapped contributor and ordered by credited area,
  completed task count, name, then stable ID. Equal totals share rank.
- Active eligible professional members may appear with zero totals.
- Administrators always have access. Employee access follows
  `studios.leaderboard_visible_to_employees`.
- `projects.include_in_productivity` is a live filter for production-stage area
  in all periods. Toggling it does not rewrite snapshots or budgets. Stage 4
  task-count events remain outside that production-area exclusion.
- Administrator-configured bonus rules are a presentation/reporting layer over
  the base totals; inspect `leaderboard_bonus_rules` and its query/helpers before
  changing calculations.

## Current unresolved boundary

`project_area_progress` and `project_members.assigned_area_m2` remain in the
schema and legacy project-summary path, but the current product has no complete
write workflow for project-area progress or workload allocation. Do not merge
that legacy model into task-derived progress or attribution without a product
decision and migration plan.

## Canonical sources

- `src/lib/project-progress.ts`
- `src/lib/productivity.ts`
- `src/lib/leaderboard-access.ts`
- `src/lib/leaderboard-bonus-rules.ts`
- `src/data/queries/project-progress.ts`
- `src/data/queries/dashboard.ts`
- Leaderboard queries in `src/data/queries/index.ts`
- `src/data/queries/leaderboard-bonus-rules.ts`
- `src/app/(app)/leaderboard/`
- Productivity, stage-budget, project-stage, and bonus-rule migrations in
  `supabase/migrations/`
- `src/lib/productivity*.test.ts` and leaderboard query/migration tests
