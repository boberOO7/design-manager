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
- `job_title` is the person's stable professional role and does not grant
  application permissions.
- `project_members` represents assignment to a project. Per-project role
  selection is not exposed in the MVP; the required database role is supplied
  by the server.
- More granular permission roles are deferred until they are actually needed.

## Project-member write authorization

- Private, narrowly scoped security-definer helpers resolve a project's studio
  for project-member write policies without recursively invoking
  `project_members` RLS.
- New assignments receive a server-owned assignment date and start with zero
  assigned area; workload allocation remains deferred.

## Employee invitation and onboarding

- Employees are invited by an authenticated, active administrator of the
  current studio. There is no public self-registration flow in StudioFlow.
- Every newly invited user receives `employee` application access. The browser
  cannot choose a system role or studio membership.
- `job_title` records the employee's stable professional position; it does not
  grant application permissions.
- An invitation creates active membership only in the inviting administrator's
  current studio. It does not create a `project_members` assignment.
- Employees see projects only after an administrator assigns them through
  `project_members`, with project visibility enforced by RLS.
