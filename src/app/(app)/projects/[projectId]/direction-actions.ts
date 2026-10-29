"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { createClient } from "@/lib/supabase/server";
import { directionPresetInputSchema, directionStatusSchema, workDirectionInputSchema } from "@/lib/work-directions";

export async function saveProjectDirection(projectId: string, version: number, input: unknown) {
  const parsed = workDirectionInputSchema.safeParse(input);
  if (!z.uuid().safeParse(projectId).success || !Number.isInteger(version) || version < 0 || !parsed.success) return { success: false, error: "invalid" } as const;
  const admin = await getActiveStudioAdmin();
  const project = await getProjectById(projectId);
  if (!admin || !project || admin.studio_id !== project.studio_id) return { success: false, error: "unavailable" } as const;
  const supabase = await createClient();
  const t = await getTranslations("TaskStages");
  const { data, error } = await supabase.rpc("save_project_work_direction", {
    p_project_id: projectId, p_expected_version: version,
    p_input: { ...parsed.data, stageNames: { stage_1: t("stage_1"), stage_2: t("stage_2"), stage_3: t("stage_3"), stage_4: t("stage_4") } },
  });
  if (error) return { success: false, error: error.message.includes("version_conflict") ? "conflict" : error.message.includes("area_allocated") ? "areaAllocated" : error.message.includes("has_work") ? "hasWork" : error.message.includes("read_only") ? "readOnly" : "failed" } as const;
  for (const path of [`/projects/${projectId}`, "/projects", "/dashboard", "/my-tasks", "/leaderboard", "/calendar", "/finance", "/statistics"]) revalidatePath(path);
  return { success: true, id: data } as const;
}

export async function saveOrderDirections(projectId: string, orderId: string, directionIds: string[], version: number) {
  const parsed = z.object({ projectId: z.uuid(), orderId: z.uuid(), directionIds: z.array(z.uuid()).min(1), version: z.number().int().nonnegative() }).safeParse({ projectId, orderId, directionIds, version });
  if (!parsed.success) return { success: false, error: "invalid" } as const;
  const admin = await getActiveStudioAdmin();
  const project = await getProjectById(projectId);
  if (!admin || !project || project.studio_id !== admin.studio_id) return { success: false, error: "unavailable" } as const;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_finance_order_directions", { p_project_id: projectId, p_order_id: orderId, p_direction_ids: directionIds, p_expected_version: version });
  if (error) return { success: false, error: error.message.includes("version_conflict") ? "conflict" : error.message.includes("has_milestones") ? "milestones" : "failed" } as const;
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/finance");
  return { success: true } as const;
}

export async function setDirectionStatus(projectId: string, directionId: string, status: unknown, version: number) {
  const parsed = z.object({ projectId: z.uuid(), directionId: z.uuid(), status: directionStatusSchema, version: z.number().int().nonnegative() }).safeParse({ projectId, directionId, status, version });
  if (!parsed.success) return { success: false, error: "invalid" } as const;
  const admin = await getActiveStudioAdmin();
  const project = await getProjectById(projectId);
  if (!admin || !project || admin.studio_id !== project.studio_id) return { success: false, error: "unavailable" } as const;
  const client = await createClient();
  const { error } = await client.rpc("set_project_work_direction_status", { p_project_id: projectId, p_direction_id: directionId, p_status: parsed.data.status, p_expected_version: version });
  if (error) return { success: false, error: error.message.includes("version_conflict") ? "conflict" : error.message.includes("open_tasks") ? "openTasks" : error.message.includes("progressed_tasks") ? "progressedTasks" : error.message.includes("read_only") ? "readOnly" : "saveFailed" } as const;
  for (const path of [`/projects/${projectId}`, "/projects", "/my-tasks", "/dashboard", "/calendar"]) revalidatePath(path);
  return { success: true } as const;
}

export async function saveDirectionPreset(input: unknown) {
  const parsed = directionPresetInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "presetInvalid" } as const;
  const admin = await getActiveStudioAdmin();
  if (!admin) return { success: false, error: "saveFailed" } as const;
  const client = await createClient();
  const { error } = await client.rpc("save_studio_direction_preset", { p_studio_id: admin.studio_id, p_input: parsed.data });
  if (error) return { success: false, error: error.message.includes("version_conflict") ? "conflict" : "saveFailed" } as const;
  revalidatePath("/projects");
  return { success: true } as const;
}
