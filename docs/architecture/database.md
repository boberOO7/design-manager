# Database

## Workflow and authority

StudioFlow uses Supabase PostgreSQL with an ordered imperative migration chain.
There is no declarative `supabase/schemas/` source.

| Artifact | Role |
| --- | --- |
| `supabase/migrations/*.sql` | Intended schema history: types, tables, grants, RLS, constraints, triggers, RPCs, and backfills. |
| `supabase/tests/*.sql` | Database-level RLS and workflow contracts. |
| `src/types/database.types.ts` | Generated current schema shape consumed by TypeScript. Never hand-edit. |
| `src/lib/*-migration.test.ts` | Static contracts for important migration security and data behavior. |
| `supabase/seed.sql` | Local development seed applied by local reset. |
| `supabase/config.toml` | Local Supabase services, exposed schemas, auth, database, and seed configuration. |

Repository state describes intended database behavior, not confirmed remote
deployment state. Inspect migration status against the target before any remote
operation.

## Domain ownership map

The generated type currently contains dozens of tables and public functions.
Use this map instead of duplicating their fields here.

| Domain | Primary tables |
| --- | --- |
| Tenant and identity | `studios`, `profiles`, `studio_members` |
| Projects | `projects`, `project_members`, `project_task_stage_columns`, `project_templates`, `project_template_tasks`, `project_activity`, legacy `project_area_progress` |
| Tasks | `tasks`, `task_collaborators`, `task_deadlines`, `task_checklist_items`, `checklist_templates`, `checklist_template_items` |
| Productivity | `productivity_attributions`, `project_stage_productivity_budgets`, `leaderboard_bonus_rules` |
| Calendar | `calendar_events`, `calendar_event_invites`, `calendar_event_participants`, `calendar_event_attendees`, `time_off_requests`, `time_off_request_approvals`, `studio_days_off` |
| Google projection | `google_calendar_connections`, `google_calendar_server_credentials`, `google_calendar_event_mappings`, `google_calendar_reconciliation_jobs` |
| Contractors | `contractors`, `contractor_categories`, `contractor_subcategories` |
| Office | `submissions`, `submission_admin_details`, `submission_comments`, `submission_reactions`, `office_assignments` |
| Delivery | `notifications` |

## Database boundary patterns

- Every browser-reachable tenant table requires explicit Data API grants and RLS.
  A grant permits an operation category; its policy limits eligible rows.
- Prefer caller-context table writes when a simple RLS/column-grant boundary is
  sufficient.
- Use a public RPC for an atomic multi-row workflow or transition that must verify
  the caller and cannot safely be decomposed by the browser.
- Use private helpers for reusable policy predicates, trigger logic, and internal
  lookups. Revoke execution from `PUBLIC`, `anon`, and `authenticated` unless a
  helper is intentionally an authenticated API.
- Security-definer functions use `set search_path = ''`, schema-qualify objects,
  verify `auth.uid()` and active membership internally, and expose only the
  minimum function grant.
- Database constraints and triggers protect cross-client invariants such as
  lifecycle transitions, immutable identity, snapshot accounting, notification
  shape, and cross-studio references.
- Mutating RPCs that lock or coordinate records use one transaction; the
  application must not reproduce half of their behavior client-side.
- Storage is a separate RLS surface. The `avatars` bucket is public for reads but
  upload/delete/select paths are constrained to the authenticated user's folder;
  profile avatar updates use guarded cleanup behavior.

## Migration procedure

1. Use Graphify and repository search to locate the owning tables, latest
   migrations, tests, generated types, queries, and domain helpers.
2. Determine the current end state by reading the entire ordered migration chain
   affecting the object; never assume the creation migration is current.
3. Create a new migration with
   `pnpm exec supabase migration new <descriptive_name>`.
4. Do not edit an applied migration. Do not push or mutate a remote database
   without explicit confirmation.
5. Rebuild or update the local database and run the narrowest SQL and TypeScript
   contract tests.
6. Regenerate types from the updated local database:

   ```bash
   pnpm exec supabase gen types typescript --local > src/types/database.types.ts
   ```

7. Review grants, RLS, `security definer` execution, tenant isolation, indexes,
   destructive cascades, and generated-type changes before handoff.

## Dependency notes

- `src/lib/supabase/client.ts` is browser-only caller context.
- `src/lib/supabase/server.ts` is the cookie-aware server client.
- `src/lib/supabase/admin.ts` and `admin-client.ts` are privileged server-only
  clients and must not enter Client Components.
- `src/lib/supabase/proxy.ts` refreshes auth state for the App Router boundary.
- `src/data/queries/active-studio-membership.ts` is the canonical tenant/role
  resolver; see [permissions.md](permissions.md).
- Domain documents explain why an RPC or trigger exists. Migrations remain
  authoritative for its exact signature and policy.

## Known legacy boundaries

- `project_area_progress` and assigned-area fields remain in the schema without a
  complete current write workflow. See [productivity.md](productivity.md).
- `tasks.due_date` remains alongside normalized milestone deadlines for
  compatibility. New deadline behavior is owned by `task_deadlines`.
- `src/data/queries/index.ts` still exposes some mock-data compatibility helpers;
  authenticated product authorization must never use mock identity or mock rows.
