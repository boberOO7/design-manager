"use server";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectTasks } from "@/data/queries/tasks";
import { canWorkOnTaskInProject } from "@/lib/project-lifecycle";
import { createClient } from "@/lib/supabase/server";
import { stageTaskEditSchema } from "@/lib/validation/task";

export async function saveStageTasks(projectId: string, input: unknown) {
  const parsed = stageTaskEditSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid" } as const;
  const admin = await getActiveStudioAdmin();
  if (!admin) return { success: false, error: "unavailable" } as const;
  const supabase = await createClient();
  const { data: project, error: projectError } = await supabase.from("projects")
    .select("studio_id, status, archived_at").eq("id", projectId).maybeSingle();
  if (projectError || !project || project.studio_id !== admin.studio_id
    || !canWorkOnTaskInProject({ projectStatus: project.status, archivedAt: project.archived_at, stage: parsed.data.stage })) {
    return { success: false, error: "unavailable" } as const;
  }

  const { error } = await supabase.rpc("save_stage_task_structure", {
    p_project_id: projectId,
    p_stage: parsed.data.stage,
    p_updates: parsed.data.updates,
    p_creates: parsed.data.creates,
    p_delete_ids: parsed.data.delete_ids,
    p_order: parsed.data.order,
  });
  if (error) {
    console.error("Unable to save stage task structure", error);
    return { success: false, error: error.code === "40001" ? "conflict" : error.code ? "failed" : "connectionLost" } as const;
  }

  for (const path of [`/projects/${projectId}`, "/projects", "/dashboard", "/my-tasks", "/leaderboard", "/calendar"]) revalidatePath(path);
  // The write has committed. A read failure must not invite re-submitting creates.
  const tasks = await getProjectTasks(projectId).catch(() => null);
  return { success: true, tasks } as const;
}
