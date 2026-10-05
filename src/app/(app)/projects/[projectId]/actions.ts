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
  createProjectActualStartDateSchema,
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
      site_address: values.site_address || null,
      client_name: values.client_name || null,
      description: values.description || null,
      total_area_m2: values.total_area_m2,
      priority: values.priority,
      start_date: values.start_date || null,
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
  const membership = await getActiveStudioAdmin();
  if (!membership) return { formError: t("errors.editPermission") };
  const project = await getProjectById(projectId);
  if (!project || project.studio_id !== membership.studio_id || project.status !== "completed" || project.archived_at) {
    return { formError: t("errors.unavailable") };
  }
  const parsed = createProjectCompletionDateSchema(getProjectValidationMessages(t), project.started_at).safeParse({ completed_at: formData.get("completed_at") });
  if (!parsed.success) {
    return {
      formError: t("validation.correctFields"),
      fieldErrors: { completed_at: parsed.error.issues[0]?.message ?? t("validation.dateInvalid") },
    };
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
  revalidatePath("/statistics");
  return { projectId: project.id, completedAt: data.completed_at };
}

export async function updateProjectActualStartDate(
  projectId: string,
  _previousState: ProjectFormActionState,
  formData: FormData,
): Promise<ProjectFormActionState> {
  const t = await getTranslations("ProjectForm");
  const membership = await getActiveStudioAdmin();
  if (!membership) return { formError: t("errors.editPermission") };
  const project = await getProjectById(projectId);
  if (!project || project.studio_id !== membership.studio_id) return { formError: t("errors.unavailable") };

  const parsed = createProjectActualStartDateSchema(getProjectValidationMessages(t), project.completed_at).safeParse({ started_at: formData.get("started_at") });
  if (!parsed.success) return { fieldErrors: { started_at: parsed.error.issues[0]?.message ?? t("validation.dateInvalid") } };
  if (project.started_at === parsed.data.started_at) return { projectId: project.id, startedAt: project.started_at };

  const supabase = await createClient();
  const { data, error } = await supabase.from("projects")
    .update({ started_at: parsed.data.started_at })
    .eq("id", project.id)
    .eq("studio_id", membership.studio_id)
    .select("id, started_at")
    .maybeSingle();
  if (error || !data) {
    console.error("Unable to update project actual start date", error);
    return { formError: t("errors.actualStartDateFailed") };
  }
  revalidateProjectRoutes(project.id);
  revalidatePath("/statistics");
  return { projectId: project.id, startedAt: data.started_at };
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
