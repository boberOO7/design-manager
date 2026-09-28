import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function refreshProjectTaskSchedules(projectIds: string[]): Promise<void> {
  if (!projectIds.length) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("refresh_project_task_schedules", { p_project_ids: projectIds });
  if (error) throw new Error("Unable to refresh task schedules.", { cause: error });
}
