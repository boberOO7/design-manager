"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { getProjectTasks } from "@/data/queries/tasks";
import { createClient } from "@/lib/supabase/server";
import {
  editProjectSchema,
  getProjectFormInput,
  isProjectTypeKey,
  type ProjectFormActionState,
  type ProjectFormField,
} from "@/lib/validation/project";

const unavailableProjectError = "The project was not found or is not available.";

function revalidateProjectRoutes(projectId: string) {
  revalidatePath("/projects");
  revalidatePath("/archive");
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  _previousState: ProjectFormActionState,
  formData: FormData,
): Promise<ProjectFormActionState> {
  const membership = await getActiveStudioAdmin();
  if (!membership) {
    return { formError: "Only active studio administrators can edit projects." };
  }

  const project = await getProjectById(projectId);
  if (
    !project ||
    project.studio_id !== membership.studio_id ||
    project.status === "completed" ||
    project.status === "archived" ||
    project.archived_at
  ) {
    return { formError: unavailableProjectError };
  }

  if (formData.has("status")) {
    return { formError: "Project status is managed through lifecycle actions." };
  }

  const input = getProjectFormInput(formData);
  const preserveLegacyProjectType = Boolean(
    project.project_type
    && !isProjectTypeKey(project.project_type)
    && input.project_type === project.project_type,
  );
  const parsed = editProjectSchema.safeParse({
    ...input,
    project_type: preserveLegacyProjectType ? "" : input.project_type,
  });
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    const fieldErrors: Partial<Record<ProjectFormField, string>> = {};

    for (const field of Object.keys(flattened) as ProjectFormField[]) {
      const message = flattened[field]?.[0];
      if (message) fieldErrors[field] = message;
    }

    return { formError: "Please correct the highlighted fields.", fieldErrors };
  }

  const values = parsed.data;
  if (project.progress_method === "area") {
    const tasks = await getProjectTasks(project.id);
    const assignedArea = tasks.filter((task) => task.status !== "cancelled").reduce((total, task) => total + Number(task.completed_area_m2 ?? 0), 0);
    if (assignedArea > values.total_area_m2) {
      return { formError: "Please correct the highlighted fields.", fieldErrors: { total_area_m2: `Design scope must cover the ${assignedArea} m² already assigned to tasks.` } };
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: values.name,
      ...(preserveLegacyProjectType ? {} : { project_type: values.project_type }),
      country_code: values.country_code,
      city: values.city || null,
      city_geonames_id: values.city_geonames_id ?? null,
      client_name: values.client_name || null,
      description: values.description || null,
      total_area_m2: values.total_area_m2,
      priority: values.priority,
      start_date: values.start_date,
      due_date: values.due_date || null,
    })
    .eq("id", project.id)
    .eq("studio_id", membership.studio_id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to update project", error);
    return { formError: "The project could not be updated. Please try again." };
  }

  revalidateProjectRoutes(project.id);
  return { projectId: project.id };
}

export async function archiveProject(projectId: string): Promise<void> {
  const membership = await getActiveStudioAdmin();
  if (!membership) redirect(`/projects/${projectId}`);

  const project = await getProjectById(projectId);
  if (
    !project ||
    project.studio_id !== membership.studio_id ||
    project.status === "archived" ||
    project.archived_at
  ) {
    redirect(`/projects/${projectId}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      status: "archived",
      archived_at: new Date().toISOString().slice(0, 10),
    })
    .eq("id", project.id)
    .eq("studio_id", membership.studio_id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to archive project", error);
    redirect(`/projects/${project.id}`);
  }

  revalidateProjectRoutes(project.id);
  redirect("/archive");
}

export async function restoreProject(projectId: string): Promise<void> {
  const membership = await getActiveStudioAdmin();
  if (!membership) redirect("/archive");

  const project = await getProjectById(projectId);
  if (
    !project ||
    project.studio_id !== membership.studio_id ||
    (project.status !== "archived" && !project.archived_at)
  ) {
    redirect("/archive");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      status: project.completed_at ? "completed" : "paused",
      archived_at: null,
    })
    .eq("id", project.id)
    .eq("studio_id", membership.studio_id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to restore project", error);
    redirect("/archive");
  }

  revalidateProjectRoutes(project.id);
  redirect(`/projects/${project.id}`);
}
