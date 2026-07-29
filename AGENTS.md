# StudioFlow

Stack: Next.js 16 App Router, TypeScript, Supabase, Tailwind, pnpm.

- Prefer Server Components. Use Client Components only when browser APIs,
  hooks, forms, or local state require them.
- Reuse existing types, Supabase clients, components, and project patterns.
- Keep browser and server Supabase clients separate.
- Use one canonical server-side authenticated Profile source.
- Never use mock identity for authentication or authorization.
- Use verified server authentication; do not use `getSession()` as the
  authorization source.
- RLS is the security boundary; hiding UI is not authorization.
- Do not edit applied migrations or change RLS, environment files,
  dependencies, or remote data unless explicitly requested.
- Represent new database schema changes with a new migration.
- Never push migrations or modify remote data without confirmation.
- Do not use `any`, `@ts-ignore`, unsafe assertions, or duplicate domain types.
- Preserve the existing visual design unless redesign is requested.
- Run the narrowest relevant validation; for TypeScript changes, normally run
  `pnpm exec tsc --noEmit` and lint the changed source files.

## Context routing

- Before editing, identify the relevant files and existing implementation
  yourself. Do not require the user prompt to enumerate source paths.
- When `graphify-out/graph.json` exists, use Graphify first for codebase
  navigation, relationships, and impact analysis.
- Use repository search or direct source inspection when Graphify does not
  provide enough detail.
- Consult `docs/decisions.md` when a task touches an established architecture,
  security, data, or UI decision.
- Consult `docs/roadmap.md` when selecting, implementing, or marking a product
  milestone.
- Consult `docs/product-spec.md` only when product behavior or scope is
  ambiguous.
- Use relevant repo-local skills when the task matches their purpose.
- Do not load every document or skill by default.
- User prompts should describe the task-specific delta, not repeat repository
  rules or list files to read.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
