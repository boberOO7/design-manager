import "server-only";

import { createClient } from "@/lib/supabase/server";
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
  return data;
}
