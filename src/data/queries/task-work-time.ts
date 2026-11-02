import "server-only";

import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { loadAllRows } from "@/data/queries/all-rows";
import { createClient } from "@/lib/supabase/server";
import { getKyivDateOnly } from "@/lib/validation/project";
import { summarizeTaskTime } from "@/lib/work-log";

export async function getTaskWorkTime(taskId: string) {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return null;
  const { membership } = access;
  const client = await createClient();
  // Check task visibility independently: own historical time does not grant access to the task.
  const task = await client.from("tasks").select("id,project:projects!inner(studio_id)")
    .eq("id", taskId).eq("project.studio_id", membership.studio_id).maybeSingle();
  if (task.error) throw new Error("Unable to load task.", { cause: task.error });
  if (!task.data) return null;
  const entries = await loadAllRows((from, to) => client.from("work_log_entries")
    .select("correction_id,id,user_id,work_date,activity_kind,task_id,review_round_id,minutes,correction:task_corrections!work_log_entries_correction_task_fkey(description,created_at),person:profiles!work_log_entries_user_id_fkey(full_name,avatar_url)")
    .eq("studio_id", membership.studio_id).eq("task_id", taskId).lte("work_date", getKyivDateOnly())
    .order("id").range(from, to));
  if (entries.error) throw new Error("Unable to load task time.", { cause: entries.error });
  const rows = entries.data ?? [];
  const people = new Map(rows.map(row => [row.user_id, row.person]));
  const summary = summarizeTaskTime(rows);
  const correctionMinutes = rows.filter(row => row.correction_id).reduce((sum,row) => sum + row.minutes,0);
  const corrections = [...new Set(rows.flatMap(row => row.correction_id ? [row.correction_id] : []))]
    .map(id => ({ id, description: rows.find(row => row.correction_id === id)?.correction?.description ?? "", createdAt: rows.find(row => row.correction_id === id)?.correction?.created_at ?? "", minutes: rows.filter(row => row.correction_id === id).reduce((sum,row) => sum + row.minutes,0) })).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  return { ...summary, correctionMinutes, corrections, ownTimeOnly: membership.system_role !== "admin", employees: summary.employees.map(person => ({
    ...person, name: people.get(person.id)?.full_name ?? null, avatarUrl: people.get(person.id)?.avatar_url ?? null,
  })) };
}

export type TaskWorkTime = NonNullable<Awaited<ReturnType<typeof getTaskWorkTime>>>;
