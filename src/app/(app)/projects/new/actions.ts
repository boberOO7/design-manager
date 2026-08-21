"use server";

import { revalidatePath } from "next/cache";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_TEMPLATE_STAGES, isProjectTemplateStage } from "@/lib/project-templates";
import {
  getProjectFormInput,
  projectSchema,
  type ProjectFormActionState,
  type ProjectFormField,
  type ProjectFormValues,
} from "@/lib/validation/project";

export async function createProject(
  _previousState: ProjectFormActionState,
  formData: FormData,
): Promise<ProjectFormActionState> {
  const membership = await getActiveStudioMembership();

  if (!membership || membership.system_role !== "admin") {
    return { formError: "Only active studio administrators can create projects." };
  }

  const parsed = projectSchema.safeParse(getProjectFormInput(formData));

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    const fieldErrors: Partial<Record<ProjectFormField, string>> = {};

    for (const field of Object.keys(flattened) as Array<keyof ProjectFormValues>) {
      const message = flattened[field]?.[0];
      if (message) fieldErrors[field] = message;
    }

    return { formError: "Please correct the highlighted fields.", fieldErrors };
  }

  const supabase = await createClient();
  const project = parsed.data;
  const stageAssignees = getStageAssignees(formData);
  if (!stageAssignees) return { formError: "Choose valid stage assignees." };
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
    },
    p_stage_assignees: stageAssignees,
    p_template_id: getSelectedTemplateId(formData),
  });

  if (insertError || !data) {
    console.error("Unable to create project", insertError);
    return { formError: "The project could not be created. Please try again." };
  }

  revalidatePath("/projects");
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
