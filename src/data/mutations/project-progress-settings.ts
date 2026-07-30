import "server-only";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { getProjectTasks } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";
import { projectProgressMethodSchema } from "@/lib/validation/project";

export async function updateProjectProgressMethod(projectId: string, input: unknown) {
  const parsed = projectProgressMethodSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, formError: "Choose a valid progress method." };
  const [membership, project] = await Promise.all([getActiveStudioAdmin(), getProjectById(projectId)]);
  if (!membership || !project || project.studio_id !== membership.studio_id || project.status === "completed" || project.status === "archived" || project.archived_at) {
    return { success: false as const, formError: "This project is not available for progress configuration." };
  }

  if (parsed.data.progress_method === "area") {
    const tasks = await getProjectTasks(project.id);
    const assignedArea = tasks.filter((task) => task.status !== "cancelled").reduce((total, task) => total + Number(task.completed_area_m2 ?? 0), 0);
    if (project.total_area_m2 <= 0) return { success: false as const, formError: "Set a positive design-scope area before enabling Area progress." };
    if (assignedArea > project.total_area_m2) return { success: false as const, formError: `Assigned task area (${assignedArea} m²) exceeds the ${project.total_area_m2} m² design scope.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("projects")
    .update({ progress_method: parsed.data.progress_method })
    .eq("id", project.id)
    .select("id, progress_method")
    .maybeSingle();
  if (error || !data) {
    console.error("Unable to update project progress method", error);
    return { success: false as const, formError: "The progress method could not be saved. Please try again." };
  }
  revalidatePath(`/projects/${project.id}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { success: true as const, progressMethod: data.progress_method };
}
