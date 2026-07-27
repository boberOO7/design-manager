"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
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

  const parsed = projectSchema.safeParse(getProjectFormInput(formData, false));

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
  const { error: insertError } = await supabase
    .from("projects")
    .insert({
      studio_id: membership.studio_id,
      created_by: membership.authenticatedUserId,
      name: project.name,
      project_code: project.project_code || null,
      client_name: project.client_name || null,
      description: project.description || null,
      total_area_m2: project.total_area_m2,
      status: "planned",
      priority: project.priority,
      start_date: project.start_date,
      due_date: project.due_date || null,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Unable to create project", insertError);
    return { formError: "The project could not be created. Please try again." };
  }

  revalidatePath("/projects");
  redirect("/projects");
}
