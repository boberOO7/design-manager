import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { getActiveTaskDeadline } from "@/lib/task-deadlines";

/** Keep the full milestone set until the canonical selector has chosen the active one. */
export async function getCalendarTasks(supabase: Awaited<ReturnType<typeof createClient>>, studioId: string, { start, end }: { start: string; end: string }) {
  const taskIds: string[] = [];
  // Below the Data API row cap; paginate candidates and keep detail URLs bounded.
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data } = await supabase.from("tasks")
      .select("id, status, deadlines:task_deadlines(id, target_status, due_date), in_range:task_deadlines!inner(), project:projects!tasks_project_id_fkey!inner(studio_id)")
      .eq("project.studio_id", studioId)
      .not("status", "in", "(completed,cancelled)")
      .not("assignee_id", "is", null)
      .gte("in_range.due_date", start)
      .lte("in_range.due_date", end)
      .order("id")
      .range(offset, offset + pageSize - 1)
      .throwOnError();
    for (const task of data) {
      const deadline = getActiveTaskDeadline(task);
      if (deadline && deadline.due_date >= start && deadline.due_date <= end) taskIds.push(task.id);
    }
    if (data.length < pageSize) break;
  }

  const batches = Array.from({ length: Math.ceil(taskIds.length / 100) }, (_, index) => taskIds.slice(index * 100, (index + 1) * 100));
  const results = await Promise.all(batches.map((ids) => supabase.from("tasks")
    .select("id, project_id, title, description, status, priority, assignee_id, deadlines:task_deadlines(id, target_status, due_date), project:projects!tasks_project_id_fkey!inner(id, name, studio_id, status), assignee:profiles!tasks_assignee_id_fkey!inner(id, full_name)")
    .eq("project.studio_id", studioId)
    .neq("status", "cancelled")
    .in("id", ids)
    .order("created_at")
    .throwOnError()));
  return { data: results.flatMap((result) => result.data), error: null };
}
