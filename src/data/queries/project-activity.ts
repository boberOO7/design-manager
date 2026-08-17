import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActivityMemberId } from "@/lib/project-activity";
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
  member: { full_name: string } | null;
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
  const memberIds = [...new Set(data.map((activity) => getActivityMemberId(activity.changes)).filter((id): id is string => id !== null))];
  if (memberIds.length === 0) return data.map((activity) => ({ ...activity, member: null }));

  const { data: members, error: membersError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", memberIds)
    .overrideTypes<Array<{ id: string; full_name: string }>, { merge: false }>();

  if (membersError || !members) {
    throw new Error(`Unable to load activity members for project ${projectId}.`, { cause: membersError });
  }

  const membersById = new Map(members.map((member) => [member.id, member]));
  return data.map((activity) => ({
    ...activity,
    member: membersById.get(getActivityMemberId(activity.changes) ?? "") ?? null,
  }));
}
