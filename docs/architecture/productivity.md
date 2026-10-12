# Productivity and progress

## Separate concepts

| Concept | Mutability | Purpose |
| --- | --- | --- |
| Task progress | Current | How far the task has moved through production and review. |
| Stage/project progress | Derived current state | Aggregation of eligible task progress. |
| Project health | Derived current state | Operational risk from lifecycle, deadlines, overdue work, and priority. |
| Productivity attribution | Append-oriented ledger with voiding | Completion identity/date history and current Stage 1/3 area credit. |
| Leaderboard | Derived projection | Period view over active eligible attribution rows plus configured bonuses. |

Completion identity and date come from attribution history, not `updated_at` or
current membership. Active Stage 1/3 area follows the current project and task roster.

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

- A qualifying completion transition creates an attribution row. Contributor and
  completion date are snapshots; active Stage 1/3 area is rebalanced in place.
- An administrator correction to a completed task's authoritative
  `tasks.completed_at` date updates the active attribution timestamp in place so
  period reporting follows the corrected Kyiv calendar date. It does not change
  contributor or stage snapshots; Stage 1/3 area follows the current roster.
- Reopening voids the active row. Recompletion creates one fresh row and does not
  double count.
- Contributor ID, name, and professional title are snapshots. They are not
  foreign keys whose later deletion or membership change rewrites history.
- Task and project deletion do not erase completed-work history. Deleting a Stage
  1/3 task removes its area share, while its completion event remains countable.
  Studio deletion is the tenant-wide deletion boundary.
- Whole-project fallback credit is legacy audit history and no longer created.
  Stage-accounting backfill voids fallback rows from active totals.

## Stage accounting

- Stable stage IDs are policy inputs. Labels, display order, visibility, and
  column configuration do not change accounting rules.
- Stage 1 receives 20% and Stage 3 receives 80% of current project area.
  `project_stage_productivity_budgets` stores the current budget and credited total.
- Stage 2 snapshots the task's `completed_area_m2`.
- Each stage budget is split equally among all current non-cancelled tasks in
  that stage, including unfinished and unassigned tasks. Adding, moving,
  cancelling, or deleting a task, or editing project area, deterministically
  rebalances active completed-task credit. A rounding remainder stays within
  the stage, so total stage shares equal its budget. Legacy Stage 1/3
  `tasks.productivity_area_m2` values are ignored; active ledger area is authoritative.
- Unassigned productivity-bearing completion is allowed only where current
  database rules can safely create no contributor attribution; assigned work
  must resolve to an active project member.
- Stage 4 completions create a zero-area task-count ledger event and no task
  productivity-area snapshot.

## Leaderboard

- Periods are month, quarter, year, or an inclusive custom month range, bounded
  in `Europe/Kyiv` with an exclusive first-of-next-month end. Custom ranges use
  the same aggregation and compare with the immediately preceding equal number
  of calendar months. URL state uses `period=custom&from=YYYY-MM&through=YYYY-MM`.
- Active rows are grouped by snapped contributor and ordered by credited area,
  completed task count, name, then stable ID. Equal totals share rank.
- Active eligible professional members may appear with zero totals.
- Credited m², the Leaderboard, and attribution rows are admin-only. The legacy
  `studios.leaderboard_visible_to_employees` setting no longer grants access.
  Employees do not load or display personal dashboard credited-area metrics.
- `projects.include_in_productivity` controls credited leaderboard area in all
  periods. When disabled, its attributions contribute 0 m² while qualifying
  task events still count. Toggling it does not rewrite ledger area or budgets.
- Administrator-configured bonus rules are a presentation/reporting layer over
  the base totals; inspect `leaderboard_bonus_rules` and its query/helpers before
  changing calculations.

## Work Log time

- Daily submission (`work_log_days`) is independent of duration, including saved
  zero-hour days. Task, review, and admin-only internal rows share the atomic save
  RPC, selected work date, and daily/weekly summaries.
- `work_log_entries.internal_activity_type` identifies internal work without a
  task, review round, project, or Calendar event. Initially `team_walkthrough`;
  future types require extending the constraint and application labels.
- Internal minutes enter employee/team time totals separately, without task/m²
  credit or project direct-labor attribution. They enter the existing labor
  normalization denominator, like internal-project time, without project shares.
  RLS hides internal rows from
  non-admins, including after demotion; ordinary saves preserve hidden history.
- Automatic task suggestions require current participation and actor-owned
  workflow or explicit progress activity. Effective completion dates suppress
  mismatched historical work; creation and metadata edits do not prove labor.
  Open In Progress tasks remain useful today; past dates require status history.
- Review suggestions use actor-specific decisions or timer history, never
  assignment or approval timestamps alone. Ambiguous older edits/decisions stay
  manually addable; saved historical entries remain independent of suggestions.
- Review statistics separate resolved reviewer steps from completed work sessions.
  Steps count on each approval/rework date, including approvals in open rounds.
  A logical `review_timer_sessions.work_session_id` counts once when all its tracked
  members finish; pause/resume interval rows do not multiply it. Shared time remains
  attributed by reviewer and round, without task-completion or m² credit.
- Calendar time retains its existing source and separate statistics. Internal
  activity logging does not create or copy Calendar time.

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
