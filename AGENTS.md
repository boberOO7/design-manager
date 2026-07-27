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
- Consult files under `docs/` only when the task depends on product scope,
  roadmap status, or architecture decisions.
