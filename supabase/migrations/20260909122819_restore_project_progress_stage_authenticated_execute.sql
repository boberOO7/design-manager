-- The security-invoker stage assignment RPC evaluates this pure lifecycle
-- predicate before updating tasks. Authenticated callers therefore need to be
-- able to execute it; task authorization remains enforced by the RPC's studio
-- admin check and the tasks RLS policies/triggers.
revoke execute on function private.is_project_progress_stage(text)
from public, anon;
grant execute on function private.is_project_progress_stage(text)
to authenticated;
