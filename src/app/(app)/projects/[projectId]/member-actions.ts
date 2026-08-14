"use server";

import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getProjectById } from "@/data/queries/project-by-id";
import { createClient } from "@/lib/supabase/server";
import {
  addProjectMemberSchema,
  removeProjectMemberWithWorkSchema,
} from "@/lib/validation/project-member";
import { getStudioMemberActionInput } from "@/lib/validation/team-membership";
import type { ProjectMemberInsert } from "@/types/project-members";

export type ProjectMemberActionState = {
  formError?: string;
  success?: "removed";
};

function getFormString(formData: FormData, field: string): string | undefined {
  const value = formData.get(field);
  return typeof value === "string" ? value : undefined;
}

function revalidateProjectMembership(projectId: string) {
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

export async function addProjectMember(
  projectId: string,
  _previousState: ProjectMemberActionState,
  formData: FormData,
): Promise<ProjectMemberActionState> {
  const membership = await getActiveStudioAdmin();
  if (!membership) {
    return { formError: "Only active studio administrators can assign project members." };
  }

  const parsed = addProjectMemberSchema.safeParse({
    projectId,
    profileId: getFormString(formData, "profile_id"),
  });
  if (!parsed.success) {
    return { formError: "Choose a valid studio member." };
  }

  const project = await getProjectById(parsed.data.projectId);
  if (!project || project.studio_id !== membership.studio_id) {
    return { formError: "The project was not found or is not available." };
  }

  const supabase = await createClient();
  const { data: targetMembership, error: targetMembershipError } = await supabase
    .from("studio_members")
    .select("id")
    .eq("studio_id", project.studio_id)
    .eq("user_id", parsed.data.profileId)
    .eq("is_active", true)
    .maybeSingle();

  if (targetMembershipError) {
    console.error("Unable to verify assignable studio member", targetMembershipError);
    return { formError: "The selected studio member could not be verified." };
  }
  if (!targetMembership) {
    return { formError: "The selected profile is not an active member of this studio." };
  }

  const { data: existingAssignment, error: existingAssignmentError } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", project.id)
    .eq("user_id", parsed.data.profileId)
    .eq("is_active", true)
    .maybeSingle();

  if (existingAssignmentError) {
    console.error("Unable to check existing project assignment", existingAssignmentError);
    return { formError: "The project assignment could not be verified." };
  }
  if (existingAssignment) {
    return { formError: "This studio member is already assigned to the project." };
  }

  const assignment: ProjectMemberInsert = {
    project_id: project.id,
    user_id: parsed.data.profileId,
    project_role: "other",
    assigned_area_m2: 0,
    assigned_at: new Date().toISOString().slice(0, 10),
  };
  const { data: insertedAssignment, error: insertError } = await supabase
    .from("project_members")
    .insert(assignment)
    .select("id")
    .maybeSingle();

  if (insertError || !insertedAssignment) {
    if (insertError?.code === "23505") {
      return { formError: "This studio member is already assigned to the project." };
    }

    console.error("Unable to add project member", insertError);
    return { formError: "The project member could not be added. Please try again." };
  }

  revalidateProjectMembership(project.id);
  return {};
}

export async function removeProjectMember(
  projectId: string,
  _previousState: ProjectMemberActionState,
  formData: FormData,
): Promise<ProjectMemberActionState> {
  const membership = await getActiveStudioAdmin();
  if (!membership) {
    return { formError: "Only active studio administrators can remove project members." };
  }

  const workInput = getStudioMemberActionInput(formData);
  const parsed = removeProjectMemberWithWorkSchema.safeParse({
    assignmentId: getFormString(formData, "assignment_id"),
    projectId,
    ...workInput,
  });
  if (!parsed.success) {
    return { formError: "Choose a valid project assignment." };
  }

  const project = await getProjectById(parsed.data.projectId);
  if (!project || project.studio_id !== membership.studio_id) {
    return { formError: "The project was not found or is not available." };
  }

  const supabase = await createClient();
  const { data: assignment, error: assignmentError } = await supabase
    .from("project_members")
    .select("id, user_id")
    .eq("id", parsed.data.assignmentId)
    .eq("project_id", project.id)
    .eq("is_active", true)
    .maybeSingle();

  if (assignmentError) {
    console.error("Unable to verify project assignment for removal", assignmentError);
    return { formError: "The project assignment could not be verified." };
  }
  if (!assignment) {
    return { formError: "The project assignment was not found or is not available." };
  }

  if (assignment.user_id !== parsed.data.userId) {
    return { formError: "The project assignment was not found or is not available." };
  }

  const { error: removalError } = await supabase.rpc("remove_project_member", {
    p_assignment_id: assignment.id,
    p_allow_unassigned: parsed.data.allowUnassigned,
    p_reassignments: parsed.data.reassignments,
  });
  if (removalError) {
    console.error("Unable to remove project member", removalError);
    return { formError: "The project member could not be removed. Review open work and try again." };
  }

  revalidateProjectMembership(project.id);
  return { success: "removed" };
}
