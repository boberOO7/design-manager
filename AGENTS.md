# StudioFlow

Stack: Next.js 16 App Router, TypeScript, Supabase, Tailwind, pnpm.

## Execution priority

Optimize for the smallest correct implementation and validation path.

Default to direct inspection of the relevant current code.

The following are opt-in, not default steps:

- Graphify
- architecture-document sweeps
- repo-local specialized skills
- external web research
- browser automation
- broad test suites
- production builds
- Graphify refreshes
- documentation updates
- unrelated cleanup or refactoring

Use them only when they materially reduce uncertainty or are required by the
actual risk of the task.

Do not invoke tools, skills, documentation, or additional validation merely to
be thorough.

Do not broaden a scoped task because nearby code could also be improved.

If requested validation is blocked by unrelated infrastructure, environment, or
fixture problems, make one reasonable attempt to verify that the blocker is
unrelated, then report it and stop. Do not repair unrelated test infrastructure,
dev-server state, Docker state, fixtures, or application code unless the task
itself requires that repair.

Do not invent new product rules, prioritization schemes, thresholds, quotas,
heuristics, or business behavior to complete an implementation. Reuse existing
domain rules and established product patterns. If a genuinely unresolved choice
materially affects behavior, surface it instead of silently deciding.

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
- Do not hand-edit `src/types/database.types.ts`; regenerate it when the local
  schema or generated database contract actually changes.
- Do not use `any`, `@ts-ignore`, unsafe assertions, or duplicate domain types
  unless there is a clearly justified and documented exception.
- Preserve the existing visual design unless redesign is explicitly requested.
- Preserve localization behavior and existing translation patterns.
- Prefer the narrowest relevant implementation change over broad refactors.
- Do not modify unrelated application code while solving a scoped task.

## Validation budget

Validation must match the risk and scope of the change.

Typical defaults:

- Small UI/copy/style fix:
  - TypeScript only when the changed code makes it relevant
  - no browser automation by default
- Local interaction/UI behavior:
  - relevant TypeScript validation
  - do not run Playwright or start a separate dev server by default
  - if an already-running local app is readily available, a quick manual/interactive
    check may be used without changing the environment
  - use automated browser/E2E validation only when the task explicitly requests it
    or the behavior cannot reasonably be validated otherwise
- Local domain logic:
  - focused unit/domain tests for the changed behavior
- Database/schema/RLS/RPC:
  - focused migration/domain/security validation for the changed invariant
  - TypeScript when generated or application contracts changed
- Large cross-domain feature:
  - broader validation only where the integration risk justifies it

Do not automatically run:

- full lint
- full unit suite
- full database suite
- full Playwright suite
- screenshot matrices
- production builds

unless the task genuinely requires them.

Browser automation is opt-in validation.

Do not start a new Next.js dev server, Playwright web server, or separate browser
test environment solely to validate ordinary UI work unless the task explicitly
requires automated browser/E2E coverage.

If browser automation is explicitly required and the existing environment is
blocked by an unrelated `.next` lock, existing dev server, unavailable local
service, stale unrelated fixture, unrelated database constraint, or other
environment problem, report the blocker and stop.

Do not modify fixtures, dev-server state, ports, Docker state, or unrelated
application code solely to make optional browser validation run.

Existing unrelated validation failures should be reported, not fixed as part of
a scoped task.

## Source of truth

Documentation is a navigation and reasoning aid, not the implementation authority.

Use this precedence when sources disagree:

1. current migrations, constraints, grants, RLS policies, and focused tests
2. current generated database types and implementation
3. `docs/architecture/*`
4. `docs/product-spec.md`

If documentation conflicts with current implementation, verify the implementation.

Update documentation only when the completed change makes stable documentation
materially incorrect or changes an architectural/domain invariant.

## Context routing

For narrow changes where the owning implementation is already identifiable,
inspect those files directly.

Use architecture documentation when:

- the owning domain is unfamiliar;
- the task crosses meaningful domain boundaries;
- an architectural invariant is relevant;
- current implementation alone does not make the intended contract clear.

For unfamiliar, cross-domain, or architectural work, start with
`docs/architecture/overview.md`, then read only the relevant owning reference.

| Change                                                      | Relevant reference                         |
| ----------------------------------------------------------- | ------------------------------------------ |
| Auth, membership, visibility, authorization, RLS            | `docs/architecture/permissions.md`         |
| Project lifecycle, metadata, team, templates, activity      | `docs/architecture/projects.md`            |
| Task stages, workflow, checklists, deadlines, collaborators | `docs/architecture/tasks.md`               |
| Progress, attribution, productivity, Leaderboard            | `docs/architecture/productivity.md`        |
| Events, time off, recurrence, Google Calendar               | `docs/architecture/calendar.md`            |
| Team, Administration, contractors, Office, notifications    | `docs/architecture/studio-operations.md`   |
| Tables, functions, triggers, migrations, generated types    | `docs/architecture/database.md`            |
| Product scope, vocabulary, product-level non-goals          | `docs/product-spec.md`                     |

Before editing, inspect only what is needed to establish the current contract:

- relevant implementation;
- latest relevant migrations when database behavior is involved;
- focused tests when they define expected behavior;
- nearby patterns when introducing or changing an interaction or abstraction.

Do not load unrelated architecture documents for additional context.

## Graphify

`graphify-out/graph.json` is the repository knowledge graph.

Graphify is optional.

Use it when direct source inspection would be inefficient or uncertain, especially
for:

- unfamiliar areas with unclear ownership;
- genuinely cross-domain relationships;
- architecture questions;
- non-obvious dependency paths;
- locating likely owners when normal repository search is insufficient.

Do not use Graphify for:

- local UI fixes;
- copy/style changes;
- known modules;
- restoring or modifying an already identified implementation;
- changes that can be understood from current files, focused search, or git history.

Prefer direct inspection and repository search when the relevant files are
already known.

Useful commands when Graphify is actually needed:

- `graphify query "<question>"`
- `graphify path "<A>" "<B>"`
- `graphify explain "<concept>"`

Do not refresh Graphify automatically after ordinary implementation work.

Refresh it only when the completed change materially changes repository/domain
relationships that future agents need to discover, such as:

- introducing or removing a significant module/domain;
- creating a new persisted domain concept;
- materially changing cross-domain ownership or dependency direction;
- materially changing architecture represented by the graph.

Do not refresh Graphify for:

- local imports;
- ordinary route edits;
- local query/mutation changes;
- styling or copy;
- translations;
- local component refactors;
- ordinary feature implementation inside an existing domain.

## Skill routing

Specialized skills are optional context, not a checklist.

Do not load a skill merely because the task belongs to its general category.
Use one only when its specialized guidance materially helps solve the task.

Typical cases:

- `supabase` / `supabase-postgres-best-practices`
  - non-trivial schema design, migrations, RLS, SQL, indexes, concurrency,
    security, or database performance
  - not required for ordinary application queries or small UI changes that
    happen to read Supabase data

- `ui-ux-pro-max`
  - genuine UX/UI decisions, new interaction structure, or unresolved usability
    questions
  - not required to preserve an existing layout, restore old UI, or fix an
    obvious local interaction bug

- `gpt-taste`
  - intentional visual redesign or art-direction work

- `impeccable`
  - explicit UI audit, refinement, or final whole-feature polish pass

- `design-system`
  - design-token, theme, CSS-variable, or component-state architecture

- `brand`
  - brand identity, voice, or brand-system work

- `slides`
  - presentation/slide work

- GSAP skills
  - non-trivial motion work where GSAP is actually needed
  - prefer CSS/native transitions for simple hover/focus/state animation

Do not load multiple overlapping design skills unless each has a distinct,
necessary role.

For obvious implementation bugs, local restoration work, or small UI fixes,
normally use no specialized skill.

## External research

Do not use external web research for repository-local implementation by default.

Use external sources only when current external information is necessary, such as:

- current third-party API/library documentation;
- behavior that cannot be determined from installed code/types;
- a version-specific external integration issue;
- an explicitly requested external comparison or research task.

Do not search the web to understand StudioFlow behavior that can be determined
from the repository, git history, local documentation, migrations, or tests.

## Database workflow

Use the full database workflow only when the task actually changes database
schema, RLS, grants, constraints, triggers, RPC contracts, or persisted domain
behavior.

When applicable:

1. Inspect the current database implementation and latest relevant migrations.
2. Preserve migration history; create a new migration for later changes.
3. Preserve tenant boundaries, grants, RLS, constraints, and guarded RPC patterns.
4. Apply and validate the specific change locally when the local Supabase
   environment is normally available.
5. Regenerate `src/types/database.types.ts` only when the generated database
   contract changed.
6. Run focused migration/RLS/domain tests for the invariant actually changed.
7. Run relevant TypeScript validation when application/generated contracts changed.
8. Update architecture documentation only if a stable invariant or domain
   relationship materially changed.

Do not:

- push migrations remotely without explicit confirmation;
- modify remote data without explicit confirmation;
- repair unrelated Docker/Supabase environment problems solely to complete
  optional validation;
- run broad database regressions for unrelated UI/application changes;
- infer remote deployment state from repository files alone.

## Documentation maintenance

Update documentation only when the completed change affects stable information
that future implementation work depends on, such as:

- architecture;
- business/domain invariants;
- permissions/security rules;
- persisted concepts;
- important cross-domain data flow;
- stable product behavior that would otherwise become materially misdocumented.

Do not update documentation for:

- styling;
- copy;
- local interaction fixes;
- small implementation refactors;
- temporary implementation details;
- obvious code structure;
- exhaustive schemas or field lists;
- validation-only changes;
- speculative roadmap items;
- remote deployment status that cannot be verified.

Keep documentation concise, retrieval-oriented, and optimized for future
coding-agent use.