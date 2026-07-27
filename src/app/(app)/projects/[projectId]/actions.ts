"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectById } from "@/data/queries/project-by-id";
import { createClient } from "@/lib/supabase/server";
import {
  editProjectSchema,
  getProjectFormInput,
  type ProjectFormActionState,
  type ProjectFormField,
} from "@/lib/validation/project";

const unavailableProjectError = "The project was not found or is not available.";

async function getAdminMembership() {
  try {
    const profile = await getCurrentUserProfile();

    if (!profile || !profile.is_active || profile.system_role !== "admin") {
      return null;
    }

    const membership = await getActiveStudioMembership();
    if (
      !membership ||
      membership.authenticatedUserId !== profile.id ||
      membership.system_role !== "admin"
    ) {
      return null;
    }

    return membership;
  } catch (error) {
    console.error("Unable to verify project administrator", error);
    return null;
  }
}

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
  const membership = await getAdminMembership();
  if (!membership) {
    return { formError: "Only active studio administrators can edit projects." };
  }

  const project = await getProjectById(projectId);
  if (
    !project ||
    project.studio_id !== membership.studio_id ||
    project.status === "archived" ||
    project.archived_at
  ) {
    return { formError: unavailableProjectError };
  }

  const parsed = editProjectSchema.safeParse(getProjectFormInput(formData, true));
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
  const completedAt =
    values.status === "completed"
      ? (project.completed_at ?? new Date().toISOString().slice(0, 10))
      : project.status === "completed"
        ? null
        : project.completed_at;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: values.name,
      project_code: values.project_code || null,
      client_name: values.client_name || null,
      description: values.description || null,
      total_area_m2: values.total_area_m2,
      status: values.status,
      priority: values.priority,
      start_date: values.start_date,
      due_date: values.due_date || null,
      completed_at: completedAt,
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
  redirect(`/projects/${project.id}`);
}

export async function archiveProject(projectId: string): Promise<void> {
  const membership = await getAdminMembership();
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
  const membership = await getAdminMembership();
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
