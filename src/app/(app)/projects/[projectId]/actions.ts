"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { createClient } from "@/lib/supabase/server";
import {
  createEditProjectSchema,
  createProjectCompletionDateSchema,
  getProjectFormInput,
  getProjectValidationFailure,
  getProjectValidationMessages,
  type ProjectFormActionState,
} from "@/lib/validation/project";

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
  const [membership, t] = await Promise.all([getActiveStudioAdmin(), getTranslations("ProjectForm")]);
  if (!membership) {
    return { formError: t("errors.editPermission") };
  }

  const project = await getProjectById(projectId);
  if (
    !project ||
    project.studio_id !== membership.studio_id ||
    project.status === "completed" ||
    project.status === "archived" ||
    project.archived_at
  ) {
    return { formError: t("errors.unavailable") };
  }

  if (formData.has("status")) {
    return { formError: t("errors.statusManaged") };
  }

  const input = getProjectFormInput(formData);
  const parsed = createEditProjectSchema(getProjectValidationMessages(t)).safeParse(input);
  if (!parsed.success) {
    return getProjectValidationFailure(parsed.error, t("validation.correctFields"));
  }

  const values = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: values.name,
      project_type: values.project_type,
      project_type_custom: values.project_type === "other" ? values.project_type_custom ?? null : null,
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
    return { formError: t("errors.updateFailed") };
  }

  revalidateProjectRoutes(project.id);
  return { projectId: project.id };
}

export async function updateProjectCompletionDate(
  projectId: string,
  _previousState: ProjectFormActionState,
  formData: FormData,
): Promise<ProjectFormActionState> {
  const t = await getTranslations("ProjectForm");
  const parsed = createProjectCompletionDateSchema(getProjectValidationMessages(t)).safeParse({ completed_at: formData.get("completed_at") });
  if (!parsed.success) {
    return {
      formError: t("validation.correctFields"),
      fieldErrors: { completed_at: parsed.error.issues[0]?.message ?? t("validation.dateInvalid") },
    };
  }

  const membership = await getActiveStudioAdmin();
  if (!membership) return { formError: t("errors.editPermission") };
  const project = await getProjectById(projectId);
  if (!project || project.studio_id !== membership.studio_id || project.status !== "completed" || project.archived_at) {
    return { formError: t("errors.unavailable") };
  }
  if (project.completed_at === parsed.data.completed_at) {
    return { projectId: project.id, completedAt: project.completed_at };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ completed_at: parsed.data.completed_at })
    .eq("id", project.id)
    .eq("studio_id", membership.studio_id)
    .eq("status", "completed")
    .is("archived_at", null)
    .select("id, completed_at")
    .maybeSingle();

  if (error || !data?.completed_at) {
    console.error("Unable to update project completion date", error);
    return { formError: t("errors.completionDateFailed") };
  }

  revalidateProjectRoutes(project.id);
  revalidatePath("/leaderboard");
  return { projectId: project.id, completedAt: data.completed_at };
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
