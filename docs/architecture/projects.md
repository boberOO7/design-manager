# Projects

## Boundary

A project is the tenant-scoped container for delivery work. It owns membership,
work directions, tasks, progress configuration, lifecycle state, and
activity history. Project health is derived and must not be confused with
lifecycle or progress.

## Key entities

| Entity | Responsibility |
| --- | --- |
| `projects` | Identity, client/location metadata, area, priority, lifecycle, dates, productivity inclusion. |
| `project_members` | Active employee assignment to a project. |
| `project_work_directions` | Production scope, optional kind, independent lifecycle, actual area, coefficient, dates and display order. |
| `studio_direction_presets` | Admin-owned starting coefficient, optional recommended range and task-template mapping per direction kind. |
| `project_task_stage_columns` | Project-unique stage identity, owning direction, productivity role, labels/order/visibility, workflow columns and progress configuration. |
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
- The shared creation form exposes Interior plus optional additional directions,
  each with its own template. `create_project_from_template` accepts these in
  `p_project.directions` and delegates to the guarded direction RPC within the same
  transaction. Extra directions inherit the project's initial dates; their areas
  and coefficients remain independent. Failure rolls back the entire creation.
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

- Hierarchy is Project → Work direction → Stage → Task. Tasks derive their
  direction through their project-owned stage; there is no independently mutable
  task direction ID. Membership remains project-wide; project and direction lifecycle are separate.
- New projects start with a localized Interior direction and the studio Interior
  coefficient (initially 1). Existing unknown directions retain their names and
  null kind. Standard names stay null/localized unless explicitly edited.
- Every project has one default direction. A single direction keeps
  the existing board and project area editor; its area synchronizes both ways
  with `projects.total_area_m2`. With multiple directions, project/object area
  stays separate and is never the sum of façade, interior and landscape areas.
- `save_project_work_direction` serializes admin CRUD/reordering with the project
  configuration version. Only empty nondefault directions without commercial or
  earned history may be removed. Started/logged stages keep their direction and
  accounting role. Archived/completed production remains protected.
- New directions receive custom stage keys and can apply an existing four-lane
  template atomically. Populated templates create only populated lanes; empty
  creation retains the standard four-stage starting structure. Applying another
  template stage later uses the existing append workflow.
- `get_project_stage_configuration` returns directions, semantic stage roles,
  studio design shares and configuration version together. The canonical
  `resolveProjectWorkspace` resolves `workDirection` for the header, Board,
  Details and Finance, including task ownership and legacy project-wide URLs.
  Multiple-direction projects open the project overview; a single direction
  opens its board directly. Direction links preserve Details/Finance context and
  use normal browser history. Visited surfaces are retained in component memory
  for the current project/user/role/locale. Board data serves every direction and
  Details; the board stays mounted through overview and shared-section visits.
  Finance cache keys include direction and every financial query parameter;
  feedback includes its page. First visits still use authorized server rendering.
  Server responses replace stale snapshots; project data revision changes clear
  other surfaces. Successful mutations must invalidate this memory even when a
  navigation interrupts revalidation. Use the workspace-aware refresh hook for
  project mutation callbacks: local History URLs need `router.replace` to reconcile
  Next's server route tree; an aligned route uses `router.refresh`. Financial forms
  invalidate on success, with explicit refresh opt-in for forms that stay in the
  project. Task API updates retain their optimistic board and invalidate dependent
  sections. No cross-project, persistent, or shared authorization/data cache exists.
  Team, Activity and Feedback live once in the shared project header.
- The shared header owns the direction switcher. Many-direction collections fold
  while keeping the selected direction visible; there is no second board filter.
  Each direction uses existing stage/task progress. The project overview presents
  task counts rather than averaging direction percentages or areas.
- Direction states are planned/active/paused/completed. Work can activate a
  planned direction; explicit completion requires no open work-stage tasks and
  does not complete the parent project. A DB task-write guard closes production
  in completed directions; additional stages and explicit completion-date
  corrections retain the existing exceptions. Project archive/completion still
  bounds operational edits. Paused directions leave personal task and Dashboard queues, following project
  pause semantics, without rewriting task schedules or earned history.
- `/projects/templates?tab=directions` edits studio presets. Direction kind,
  object type and task template are independent. Templates may be selected across
  object types within the same studio. Presets seed new forms only; existing
  directions/tasks are never regenerated. Recommended ranges are soft guidance,
  and exact positive coefficients outside them remain valid.

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

Administrators have project-wide and direction-scoped `view=finance` workspaces.
Finance owns agreements, flexible expected payments, supervision and
contractor bonus income; see [finance.md](finance.md). Orders associate with one
or several directions, while production credit, contractual amounts and cash
remain independent. Optional earning milestones refer to stages within the
order's linked directions. Finance never copies the CRM lead budget. Completion/archive keeps Finance
writable for collections. Operational lifecycle changes do not settle, cancel,
or stop financial arrangements. Financially referenced projects cannot be deleted.
Finance private amendments never enter the ordinary project activity feed.

## Client feedback

The admin-only shared-header `view=feedback` link creates/copies/revokes invitations and reads
responses, including for completed or archived projects. The Feedback tab at
`/statistics?section=feedback` shows studio averages, monthly response counts/ratings
and NPS (% 9–10 minus % 0–6). Its date/project filters remain independent of the
other Statistics periods. `/feedback` redirects here, preserving its filters.
`/admin/client-survey` edits the current published studio questionnaire. Save
appends an immutable `feedback_template_versions` row and atomically advances the
published pointer; Cancel discards local edits. There is no separate draft UI or
publish step. The existing `feedback_templates` revision/pointer row and guarded
save RPC remain the storage contract; reads use the published config, so older
unpublished drafts never become the active questionnaire. Revision checks reject
concurrent edits. First use creates the original questionnaire. Each invitation
captures its published version; existing links/answers never change on save.

Questionnaire appearance keeps an optional `background` enum in the immutable
config: `original` (also the legacy missing-field default), `slate`, `tinted`, or
`paper`. Arbitrary background colours are rejected by both Zod and the database
validator. Accent stays a HEX colour; new background palettes derive readable
foreground shades from it, and the tinted preset follows the accent. No history
backfill or changes to existing invitations are needed.

The five standard IDs remain `satisfaction`, `communication`, `timeliness`,
`expectations` (1–5), and `recommendation` (0–10). Wording, order and visibility
can change; visible standard metrics are required. Hidden metrics remain NULL,
so averages and NPS use only actual answers. Additional UUID questions support
text, 1–5 ratings and single choice; requiredness/options are checked against the
invitation's snapshot. Additional analytics are separated by publication and
question ID, even if an ID is reused with different wording/type/options.

Analytics use admin RLS and a caller-context aggregate RPC. Date/project filters
select invitations created in the inclusive Kyiv date range; response rate is
invitations with at least one response/all invitations in that cohort (including
expired/revoked). Counts and averages include every response, while monthly
trends use Kyiv response dates. NPS is (% 9–10 minus % 0–6), with 7–8 passive and
missing recommendation excluded from its denominator. `/survey/preview` verifies
admin membership, renders the real form in same-origin desktop/mobile iframes,
accepts validated local edits from its parent and never submits a response.
No stage questionnaires or automated invitations.

`project_feedback` owns reusable invitations; `project_feedback_responses` stores
separate immutable submissions linked to an invitation. Existing answers are
preserved when separating storage. Composite project/studio identity prevents
cross-tenant links; active admin/profile RLS and guarded
create/revoke RPCs protect results and writes. Random 256-bit bearer tokens are
readable only through admin RLS (so links can be copied again). Treat them as
secrets. `/survey/[token]` exposes only the invitation version’s public questionnaire,
snapshotted studio name, existing branding and invitation availability,
never project/client details or answers. Copied `/f/[token]` links encode the same
256-bit secret as 43 base64url characters and rewrite to the survey; legacy hex
links remain valid. New date-only invitations expire at the midnight after the
selected day in the application Kyiv timezone. It uses the existing shared SPACE logo
and stored studio name; studios currently have no configurable logo field.

Public submission passes same-origin, bounded-body, schema and honeypot checks
before a service-only RPC atomically locks an unrevoked/unexpired invitation
and inserts a response. A URL accepts multiple submissions until expiry or
revocation, including concurrent submissions. Revocation stops new submissions
without changing existing responses. The original RPC signature remains compatible
with already-loaded legacy forms. Published versions and submitted responses
are protected from updates by triggers. Public respondents cannot read other
answers. Responses are anonymous; the shared bearer link does not identify or
deduplicate individual clients.

The public API uses service-only `submit_feedback_with_cooldown`: per invitation
and source, two successful responses may arrive immediately, then a five-minute
cooldown runs from the second response. Five idle minutes restore the two-response
burst. Invalid answers and blocked retries consume no places or extend the pause.
The invitation lock serializes checks and writes across server instances.
`private.feedback_submission_limits` stores only a link-scoped HMAC of the source
and its counter/timestamp; no raw IPs, responses or hashes are exposed publicly.
On Vercel the source is the platform-overwritten `x-vercel-forwarded-for` header;
outside Vercel or with a missing/invalid header the link uses a shared fallback
bucket rather than trusting caller-provided IP headers. The API returns 429 with
`Retry-After`; the form preserves its inputs and explains the wait. This limits
feedback spam, not traffic reaching the application/database; infrastructure
DDoS mitigation remains a hosting concern. No external anti-bot service, Realtime
or background job.

Canonical paths: `src/components/feedback/`, `src/data/queries/feedback.ts`,
`src/app/api/feedback/`, `src/app/api/projects/[projectId]/feedback/`,
`supabase/migrations/*feedback*.sql`.

## Canonical sources

- `src/app/(app)/projects/`
- `src/components/projects/`
- `src/lib/work-directions.ts`, project `direction-actions.ts`, and
  `src/components/projects/project-work-directions.tsx`
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
