# StudioFlow architecture decisions

- Use Next.js 16 App Router, React, TypeScript, Tailwind and pnpm.
- Use Supabase PostgreSQL, Auth, SSR clients and RLS.
- Prefer Server Components unless browser APIs, hooks or local interaction
  require a Client Component.
- Keep browser and server Supabase clients separate.
- Use one canonical server-side source for the authenticated Profile.
- Never use mock identity for authentication or authorization.
- Replace mock business data incrementally, one functional area at a time.
- Treat RLS as the actual authorization boundary.
- UI visibility alone must never be treated as authorization.
- Never expose the Supabase service-role key to browser code.
- Do not edit migrations that have already been applied remotely.
- Create a new migration for every later schema or RLS change.
- Do not push migrations or modify remote data without explicit confirmation.
- Preserve the current visual design unless a redesign is specifically requested.

## Project archive lifecycle

- Archived projects use `status = archived` and retain their project data.
- Restoring an archived project with an existing `completed_at` date returns it
  to `completed`.
- Restoring any other archived project returns it to `paused`.

## Roles and permissions

- `system_role` controls application access and is currently either
  `admin` or `employee`.
- All non-admin employees initially have the same application permissions.
- `job_title` describes a person's profession and does not grant permissions.
- `project_members.project_role` describes responsibility within one project
  and does not grant studio-wide admin permissions.
- More granular permission roles are deferred until they are actually needed.
