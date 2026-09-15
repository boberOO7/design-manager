"use server";

import { z } from "zod";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectTaskById } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";

/** Read-only action: opening a drawer does not invalidate or reload Dashboard. */
export async function loadDashboardTask(taskId: string, projectId: string) {
  if (!z.uuid().safeParse(taskId).success || !z.uuid().safeParse(projectId).success) return null;
  const membership = await getActiveStudioMembership();
  if (!membership) return null;
  const supabase = await createClient();
  const { data: project, error } = await supabase.from("projects").select("id")
    .eq("id", projectId).eq("studio_id", membership.studio_id).maybeSingle();
  if (error) throw new Error("Unable to verify task project.", { cause: error });
  if (!project) return null;
  const task = await getProjectTaskById(taskId);
  return task?.project_id === project.id ? task : null;
}
