"use server";

import { z } from "zod";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getAssignableProjectMembers } from "@/data/queries/project-members";
import { getProjectTaskById } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";

export async function loadMyTaskDetails(taskId: string, projectId: string) {
  if (!z.uuid().safeParse(taskId).success || !z.uuid().safeParse(projectId).success) return null;
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return null;
  const client = await createClient();
  const { data: project, error } = await client.from("projects").select("id,status,archived_at")
    .eq("id", projectId).eq("studio_id", access.membership.studio_id).maybeSingle();
  if (error) throw new Error("Unable to load task project.", { cause: error });
  if (!project) return null;
  const canManageTasks = access.membership.system_role === "admin";
  const [task, members] = await Promise.all([
    getProjectTaskById(taskId),
    canManageTasks ? getAssignableProjectMembers(projectId, access.membership.studio_id) : Promise.resolve([]),
  ]);
  return task?.project_id === project.id ? { task, project, canManageTasks, members } : null;
}
