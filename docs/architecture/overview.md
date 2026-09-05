# Architecture overview

This is the primary coding-agent entry point for StudioFlow. Read the smallest
domain document that covers the change, then verify every claim in the current
implementation before editing.

## System boundary

StudioFlow is a Next.js application backed by Supabase Auth, PostgreSQL, Storage,
and the Data API. It is a single-studio product at runtime: authenticated access
must resolve to one active Profile and exactly one active studio membership.

```text
Browser
  -> App Router page / Client Component
  -> Server Component, Server Action, or Route Handler
  -> domain validation + verified user/membership lookup
  -> Supabase Data API or narrowly scoped RPC
  -> grants + RLS + database constraints/triggers
```

RLS is the security boundary. Server checks provide early, domain-specific
feedback but never replace policies, column privileges, constraints, or guarded
database functions.

## Request and data flow

| Flow | Canonical pattern | Starting points |
| --- | --- | --- |
| Authenticated page read | Server Component calls a server-only query using the cookie-aware server client. | `src/app/(app)/layout.tsx`, `src/data/queries/`, `src/lib/supabase/server.ts` |
| Interactive mutation | Client submits to a Server Action or same-origin Route Handler; input is validated, actor is verified, then RLS/RPC enforces the write. | `src/app/(app)/**/actions.ts`, `src/app/api/`, `src/data/mutations/` |
| Privileged operation | A narrow server-only path uses the admin client only when the operation cannot use the caller's RLS context. | `src/lib/supabase/admin.ts`, `src/lib/supabase/admin-client.ts` |
| Database-owned workflow | A migration defines an atomic RPC, transition guard, audit record, notification, or attribution trigger. | `supabase/migrations/` |
| Google reconciliation | A Calendar write enqueues a coalesced database job; a post-response worker accelerates processing and a protected scheduled drain provides durability. | `src/lib/google-calendar/queue.ts`, `src/lib/google-calendar/sync.ts` |

Prefer Server Components. Use Client Components only for browser APIs, hooks,
forms, local interaction, or optimistic state.

## Module map

| Domain | User routes | Server/data core | Reference |
| --- | --- | --- | --- |
| Shell and dashboard | `/dashboard` | `src/app/(app)/layout.tsx`, `src/data/queries/dashboard.ts`, `src/constants/navigation.ts` | This document; [permissions](permissions.md) |
| Projects | `/projects`, `/projects/[projectId]`, `/archive`, `/projects/templates` | `src/data/queries/project-*.ts`, `src/data/mutations/project-lifecycle.ts`, project Server Actions | [projects](projects.md) |
| Tasks | `/my-tasks`, project Board | `src/data/queries/tasks.ts`, `src/data/mutations/task-*.ts`, task Route Handlers | [tasks](tasks.md) |
| Productivity | `/leaderboard`, project and dashboard summaries | `src/lib/productivity.ts`, `src/data/queries/index.ts`, attribution migrations | [productivity](productivity.md) |
| Calendar | `/calendar`, `/api/calendar/*`, `/api/integrations/google-calendar/*` | `src/data/queries/calendar.ts`, `src/lib/calendar*.ts`, `src/lib/google-calendar/` | [calendar](calendar.md) |
| Studio operations | `/team`, `/contractors`, `/office/*`, `/admin` | Domain queries/actions plus notification header and APIs | [studio operations](studio-operations.md) |
| Database and authorization | All domains | Migrations, generated types, RLS contract tests | [database](database.md), [permissions](permissions.md) |

## Source-of-truth hierarchy

Use the source appropriate to the question; documentation is a map, not an
override.

1. **Database behavior:** the ordered migration chain in `supabase/migrations/`.
   It defines intended schema, grants, RLS, constraints, triggers, and RPCs.
2. **Application behavior:** current routes, queries, mutations, components, and
   domain helpers under `src/`.
3. **Intentional contracts:** colocated TypeScript tests and `supabase/tests/`.
   Tests often capture security or transition behavior more clearly than UI.
4. **Generated database shape:** `src/types/database.types.ts`. Regenerate it
   from the current local schema; never edit it by hand.
5. **Architecture documents:** durable boundaries and navigation only. When a
   document conflicts with implementation, inspect the relevant migration and
   test, fix the behavior or document deliberately, and update the summary.

Repository state cannot prove which migrations or scheduler settings are
deployed remotely. Do not encode “deployed” or “pending deployment” in these
documents without external verification.

## Cross-cutting rules

- Authentication uses `supabase.auth.getUser()`, not `getSession()`, as the
  authorization source. `resolveActiveStudioMembership()` is the canonical
  server-side membership resolver.
- Keep browser, server, and privileged Supabase clients separate. Never expose a
  secret/service key to browser code.
- Domain inputs use typed validation, usually Zod, before mutation. Database
  constraints and RLS still validate the security-sensitive boundary.
- Prefer existing domain types. Do not introduce `any`, unsafe assertions,
  duplicate DTOs, or hand-edited generated types.
- Localization uses typed `next-intl` messages for English and Ukrainian. URLs
  are unprefixed; locale resolves from the `studioflow-locale` cookie, then
  `Accept-Language`, then English.
- Business dates and timed Calendar presentation use the application timezone
  `Europe/Kyiv`. Preserve date-only semantics for project/task deadlines and
  full-day time off.
- The UI direction is a quiet, dense architectural operations system: warm
  neutral surfaces, restrained hierarchy, borders before shadows, shared
  semantic colors, and no decorative gradients or glass effects.
- Shared drawers and mobile navigation must remain labelled, focus-trapped,
  keyboard-operable, scroll-locked, dismissible when safe, and return focus.
- Mutations revalidate every affected consumer. Project/task changes commonly
  affect Projects, Dashboard, My Tasks, Calendar, and Leaderboard.
- Add schema changes in a new migration. Never revise an applied migration or
  push remote changes without explicit confirmation.

## Read next

| Task | Read |
| --- | --- |
| Login, identity, visibility, membership, RLS, privileged access | [permissions.md](permissions.md), then [database.md](database.md) |
| Project form, lifecycle, archive, membership, templates, activity | [projects.md](projects.md) |
| Task board, stages, status, checklist, deadlines, collaborators | [tasks.md](tasks.md) |
| Progress calculations, attribution, Leaderboard, bonuses | [productivity.md](productivity.md) |
| Events, time off, Calendar views, recurrence, Google synchronization | [calendar.md](calendar.md) |
| Team, Administration, contractors, submissions, office assignments, notifications | [studio-operations.md](studio-operations.md) |
| Tables, functions, triggers, migration or generated types | [database.md](database.md), plus the owning domain document |
| Product scope or terminology | [../product-spec.md](../product-spec.md) |
