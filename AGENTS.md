# StudioFlow

Stack: Next.js 16 App Router, TypeScript, Supabase, Tailwind, pnpm.

## Working rules

- Prefer Server Components. Use Client Components only when browser APIs,
  hooks, forms, local interaction, or optimistic state require them.
- Reuse existing types, Supabase clients, components, and established project patterns.
- Keep browser, server, and privileged Supabase clients separate.
- Use `resolveActiveStudioMembership()` as the canonical tenant/role source and
  `auth.getUser()` for verified authentication.
- Never introduce authorization based on `getSession()`, mock identity,
  descriptive profile metadata, or hidden UI state.
- RLS, explicit grants, constraints, and guarded RPCs are the security boundary.
- Never expose a Supabase secret/service key to browser code.
- Do not edit applied migrations. Represent every later schema or RLS change in
  a new migration.
- Never push migrations or modify remote data without explicit confirmation.
- Do not hand-edit `src/types/database.types.ts`; regenerate it from the current
  local schema.
- Do not use `any`, `@ts-ignore`, unsafe assertions, or duplicate domain types
  unless there is a clearly justified and documented exception.
- Preserve the existing visual design unless redesign is explicitly requested.
- Preserve localization behavior and existing translation patterns.
- Prefer the narrowest relevant implementation change over broad refactors.
- Run the narrowest relevant validation:
  - TypeScript changes: normally `pnpm exec tsc --noEmit`
  - Lint changed source files when relevant
  - Run focused domain tests for changed behavior
  - Run migration-contract and RLS tests when database/security boundaries change
- Do not modify unrelated application code while solving a scoped task.

## Source of truth

Documentation is a navigation and reasoning aid, not the implementation authority.

Use this precedence when sources disagree:

1. current migrations, constraints, grants, RLS policies, and focused tests
2. current generated database types and implementation
3. `docs/architecture/*`
4. `docs/product-spec.md`

If documentation conflicts with current implementation, verify the implementation
and update the documentation when appropriate.

## Context routing

Start with [the architecture overview](docs/architecture/overview.md) for
unfamiliar, cross-domain, or architectural work.

Then read only the owning domain reference:

| Change | Read |
| --- | --- |
| Auth, membership, visibility, authorization, RLS | `docs/architecture/permissions.md` |
| Project lifecycle, metadata, team, templates, activity | `docs/architecture/projects.md` |
| Task stages, workflow, checklists, deadlines, collaborators | `docs/architecture/tasks.md` |
| Progress, attribution, productivity, Leaderboard | `docs/architecture/productivity.md` |
| Events, time off, recurrence, Google Calendar | `docs/architecture/calendar.md` |
| Team, Administration, contractors, Office, notifications | `docs/architecture/studio-operations.md` |
| Tables, functions, triggers, migrations, generated types | `docs/architecture/database.md` |
| Product scope, vocabulary, product-level non-goals | `docs/product-spec.md` |

For narrow changes where the owning files are already known, inspect those files
directly instead of loading unrelated documentation.

Before editing:
- identify the relevant implementation
- inspect the latest relevant migrations when database behavior is involved
- inspect focused tests when they define expected behavior
- verify nearby patterns before introducing new abstractions

## Graphify

`graphify-out/graph.json` is the repository knowledge graph.

Use Graphify first for:
- unfamiliar codebase areas
- cross-domain changes
- architecture questions
- dependency tracing
- identifying likely owning modules or files

For narrow changes where the relevant files are already known, direct inspection
is preferred.

Useful commands:

- `graphify query "<question>"` — scoped repository questions
- `graphify path "<A>" "<B>"` — relationships and dependency paths
- `graphify explain "<concept>"` — focused node or concept explanation

Use repository search or direct source inspection when Graphify is incomplete,
ambiguous, or insufficient.

Refresh Graphify after structural or dependency-relevant changes, including:
- adding, removing, or renaming modules/files
- changing imports or cross-domain dependencies
- changing routes
- changing schema, queries, mutations, or RPC boundaries
- materially changing architecture documentation

Do not refresh Graphify for purely local styling, copy changes, translation text,
or other changes that do not affect repository structure or relationships.

## Skill routing

Use specialized skills only when they are relevant to the task.

- Supabase schema, SQL, migrations, RLS, indexes, query/database performance:
  use `supabase` and `supabase-postgres-best-practices`
- General UI/UX structure, interaction patterns, usability, accessibility:
  use `ui-ux-pro-max`
- Deliberate visual redesign, stronger art direction, or avoiding generic AI/SaaS styling:
  use `gpt-taste`
- UI audit, critique, refinement, or final polish:
  use `impeccable`
- Design tokens, CSS variables, component states, or theme architecture:
  use `design-system`
- Brand identity, brand voice, or brand consistency:
  use `brand`
- Presentation/slide work:
  use `slides`

Do not load multiple overlapping design skills unless the task genuinely requires
their distinct roles.

Prefer:
- one primary design skill for implementation
- `impeccable` as a separate review/polish pass when needed

## Database workflow

When changing the database:

1. Inspect the current schema and latest relevant migrations.
2. Create a new migration; never rewrite applied migration history.
3. Preserve tenant boundaries, grants, RLS, constraints, and guarded RPC patterns.
4. Apply and validate the migration locally.
5. Regenerate `src/types/database.types.ts`.
6. Run focused migration/RLS/domain tests.
7. Run TypeScript validation.
8. Update relevant architecture documentation if behavior or invariants changed.

Do not infer remote deployment state from repository files alone.

## Documentation maintenance

Update documentation only when the change affects stable product behavior,
architecture, business rules, permissions, data flow, or cross-domain relationships.

Do not document:
- temporary implementation details
- obvious code structure that can be read directly
- exhaustive schemas or field lists
- remote deployment status that cannot be verified
- speculative roadmap items

Keep documentation concise, retrieval-oriented, and optimized for future coding-agent use.