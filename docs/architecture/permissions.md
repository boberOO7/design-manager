# Permissions

## Identity model

| Concept | Authority | Notes |
| --- | --- | --- |
| Auth user | Supabase Auth | Verify server-side with `auth.getUser()`. |
| Profile | `profiles` | Canonical person record; must be active for product access. A legacy `system_role` mirror remains. |
| Studio membership | `studio_members` | Tenant-scoped `admin`/`employee` authority, active state, and joined/removed dates. |
| Professional title | `profiles.job_title` | Descriptive; never grants access. |
| Project membership | `project_members` | Employee visibility and assignment to one project. |
| Task assignee | `tasks.assignee_id` | Owns task status/progress/checklist interaction. |
| Task collaborator | `task_collaborators` | Participates in visibility and personal work lists, but is not treated as the assignee for mutations. |

`src/data/queries/active-studio-membership.ts` is the canonical server resolver.
It accepts exactly one active membership and returns explicit unauthenticated,
no-studio, active-studio, and multiple-studio outcomes. The authenticated layout
also requires a matching active Profile.

The role is currently duplicated in `profiles.system_role` and
`studio_members.system_role`. Membership is the tenant-scoped source used by the
shell and most domains; team invitation/profile actions additionally require the
Profile mirror to agree and the profile-update RPC changes both atomically. Do
not add new authorization dependencies on the Profile mirror. Treat divergence
as invalid data until the duplicate field is deliberately retired or formalized.

## Access matrix

This table is a navigation aid. Verify the relevant RLS policy, grants, RPC, and
server guard before changing a write.

| Capability | Administrator | Employee |
| --- | --- | --- |
| Projects | All projects in active studio | Active project memberships only |
| Project create/edit/lifecycle/archive | Yes | No |
| Project membership | Manage | No |
| Task details/create/delete/bulk operations | Manage within studio/project constraints | No |
| Task status, production progress, checklist | Any eligible studio project task | Own assigned eligible task |
| Collaborative task visibility | Yes | Included where query/policy permits; collaboration does not grant assignee mutation rights |
| Dashboard | Studio metrics, attention, workload, own tasks | Personal tasks, projects, deadlines |
| Leaderboard | Always | Only when studio setting enables it |
| Team directory | Active and former members | Active directory |
| Invite/edit/remove/restore studio members | Yes | No; self-service profile fields use separate constrained paths |
| Contractors | Create and edit; delete and manage categories | Create and edit; no deletion/category administration |
| Time-off request | Own request | Own request |
| Time-off review/private details | All authorized studio requests | Own requests only |
| Calendar events | Subject to event/project rules | Subject to event/project rules |
| Submissions | Type/workflow-dependent management | Create and participate where authorized |
| Office assignments | Create/manage/cancel; read all in studio | Read and transition assignments for which responsible |
| Notifications | Own recipient rows only | Own recipient rows only |

## Invariants

- RLS and explicit grants are the final boundary. UI visibility and server checks
  are defense and feedback, not authorization by themselves.
- All tenant-owned writes must resolve the actor's active studio and prevent
  cross-studio references.
- `system_role` is currently only `admin` or `employee`. Professional titles and
  other descriptive profile metadata must not be consulted for authority.
- Invitation is administrator-only. New users receive employee membership in
  the inviter's current studio and no automatic project membership.
- Project access for employees ends when project membership becomes inactive.
- Studio-member removal preserves history, removes operational access, and may
  require explicit reassignment of open work. Restoration does not recreate
  project memberships automatically.
- Project-member and studio-member removal use atomic RPCs so impact checks,
  reassignment, and deactivation cannot diverge.
- Notification reads constrain both notification ID and current recipient.
- Private time-off notes and review notes never enter coworker availability or
  notification content.
- Privileged `security definer` functions must use an empty `search_path`, verify
  the actor internally, and have `PUBLIC`/`anon` execution revoked. Private
  helpers are not browser APIs.
- The admin/service client is server-only and limited to genuinely privileged
  workflows such as user invitation, bootstrap, avatar cleanup, or Google job
  processing.

## Canonical sources

- `src/data/queries/active-studio-membership.ts`
- `src/data/queries/active-studio-admin.ts`
- `src/data/queries/current-user-profile.test.ts`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/team/actions.ts`
- `src/data/mutations/task-status.ts`
- `src/app/(app)/contractors/actions.ts`
- `supabase/migrations/` — search the owning table/RPC for current policy state
- `supabase/tests/` and `*.contract.test.ts` — authorization contracts

See [database.md](database.md) for schema workflow and [calendar.md](calendar.md)
for the Calendar privacy boundary.
