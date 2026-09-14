"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_TEMPLATE_STAGES, isProjectTemplateStage } from "@/lib/project-templates";
import {
  createProjectSchema,
  getProjectFormInput,
  getProjectValidationFailure,
  getProjectValidationMessages,
  type ProjectFormActionState,
} from "@/lib/validation/project";

export async function createProject(
  _previousState: ProjectFormActionState,
  formData: FormData,
): Promise<ProjectFormActionState> {
  return createProjectRecord(null, formData);
}

export async function createProjectFromLead(
  leadId: string,
  _previousState: ProjectFormActionState,
  formData: FormData,
): Promise<ProjectFormActionState> {
  return createProjectRecord(leadId, formData);
}

async function createProjectRecord(
  sourceLeadId: string | null,
  formData: FormData,
): Promise<ProjectFormActionState> {
  const [membership, t] = await Promise.all([getActiveStudioMembership(), getTranslations("ProjectForm")]);

  if (!membership || membership.system_role !== "admin") {
    return { formError: t("errors.createPermission") };
  }
  if (sourceLeadId && !z.uuid().safeParse(sourceLeadId).success) {
    return { formError: t("errors.invalidSourceLead") };
  }

  const parsed = createProjectSchema(getProjectValidationMessages(t)).safeParse(getProjectFormInput(formData));

  if (!parsed.success) {
    return getProjectValidationFailure(parsed.error, t("validation.correctFields"));
  }

  const supabase = await createClient();
  const project = parsed.data;
  const stageAssignees = getStageAssignees(formData);
  if (!stageAssignees) return { formError: t("validation.stageAssigneesInvalid") };
  const { data, error: insertError } = await supabase.rpc("create_project_from_template", {
    p_project: {
      studio_id: membership.studio_id,
      name: project.name,
      project_type: project.project_type,
      project_type_custom: project.project_type === "other" ? project.project_type_custom ?? null : null,
      country_code: project.country_code,
      city: project.city || null,
      city_geonames_id: project.city_geonames_id ?? null,
      client_name: project.client_name || null,
      description: project.description || null,
      total_area_m2: project.total_area_m2,
      priority: project.priority,
      start_date: project.start_date,
      due_date: project.due_date || null,
      ...(sourceLeadId ? { source_lead_id: sourceLeadId } : {}),
    },
    p_stage_assignees: stageAssignees,
    p_template_id: getSelectedTemplateId(formData) ?? undefined,
  });

  if (insertError || !data) {
    console.error("Unable to create project", insertError);
    return { formError: t("errors.createFailed") };
  }

  revalidatePath("/projects");
  if (sourceLeadId) revalidatePath("/crm/leads");
  return { projectId: data };
}

function getSelectedTemplateId(formData: FormData): string | null {
  const value = formData.get("project_template_id");
  return typeof value === "string" && value ? value : null;
}

function getStageAssignees(formData: FormData): Array<{ stage: string; assignee_id: string | null }> | null {
  const assignees: Array<{ stage: string; assignee_id: string | null }> = [];
  for (const stage of PROJECT_TEMPLATE_STAGES) {
    const value = formData.get(`stage_assignee_${stage}`);
    if (typeof value !== "string") return null;
    assignees.push({ stage, assignee_id: value || null });
  }
  return assignees.every((assignee) => isProjectTemplateStage(assignee.stage)) ? assignees : null;
}
