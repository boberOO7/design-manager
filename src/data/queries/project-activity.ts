import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActivityMemberIds } from "@/lib/project-activity";
import type { Json } from "@/types/database.types";

export type ProjectActivity = {
  id: string;
  action_type: string;
  actor_id: string | null;
  changes: Json;
  created_at: string;
  entity_id: string | null;
  entity_type: string;
  actor: { avatar_url: string | null; full_name: string } | null;
  memberNames: Record<string, string>;
  task: { title: string } | null;
};

export async function getProjectActivity(projectId: string): Promise<ProjectActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_activity")
    .select("id, action_type, actor_id, changes, created_at, entity_id, entity_type, actor:profiles!project_activity_actor_id_fkey(full_name, avatar_url)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .overrideTypes<ProjectActivity[], { merge: false }>();

  if (error || !data) {
    throw new Error(`Unable to load activity for project ${projectId}.`, { cause: error });
  }
  const memberIds = [...new Set(data.flatMap((activity) => getActivityMemberIds(activity.changes)))];
  const taskIds = [...new Set(data.flatMap((activity) => activity.entity_type === "task" && activity.entity_id ? [activity.entity_id] : []))];

  const [membersResult, tasksResult] = await Promise.all([
    memberIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", memberIds).overrideTypes<Array<{ id: string; full_name: string }>, { merge: false }>()
      : Promise.resolve({ data: [], error: null }),
    taskIds.length > 0
      ? supabase.from("tasks").select("id, title").in("id", taskIds).overrideTypes<Array<{ id: string; title: string }>, { merge: false }>()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (membersResult.error || !membersResult.data) {
    throw new Error(`Unable to load activity members for project ${projectId}.`, { cause: membersResult.error });
  }
  if (tasksResult.error || !tasksResult.data) throw new Error(`Unable to load activity tasks for project ${projectId}.`, { cause: tasksResult.error });

  const memberNamesById = new Map(membersResult.data.map((member) => [member.id, member.full_name]));
  const tasksById = new Map(tasksResult.data.map((task) => [task.id, task]));
  return data.map((activity) => ({
    ...activity,
    memberNames: Object.fromEntries(getActivityMemberIds(activity.changes).flatMap((id) => {
      const name = memberNamesById.get(id);
      return name ? [[id, name]] : [];
    })),
    task: activity.entity_type === "task" && activity.entity_id ? tasksById.get(activity.entity_id) ?? null : null,
  }));
}
