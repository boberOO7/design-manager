-- Allow authenticated callers of the SECURITY INVOKER task-edit RPC
-- to execute the read-only collaborator validation helper.

revoke execute
on function private.is_active_task_collaborator(uuid, uuid)
from public, anon;

grant execute
on function private.is_active_task_collaborator(uuid, uuid)
to authenticated;