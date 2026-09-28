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
  success?: "added" | "removed";
};

function getFormString(formData: FormData, field: string): string | undefined {
  const value = formData.get(field);
  return typeof value === "string" ? value : undefined;
}

function revalidateProjectMembership(projectId: string) {
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

export async function addProjectMembers(
  projectId: string,
  _previousState: ProjectMemberActionState,
  formData: FormData,
): Promise<ProjectMemberActionState> {
  const membership = await getActiveStudioAdmin();
  if (!membership) return { formError: "Only active studio administrators can assign project members." };

  const parsed = addProjectMemberSchema.safeParse({
    projectId,
    profileIds: formData.getAll("profile_ids"),
  });
  if (!parsed.success || new Set(parsed.data.profileIds).size !== parsed.data.profileIds.length) {
    return { formError: "Choose valid studio members." };
  }

  const project = await getProjectById(parsed.data.projectId);
  if (!project || project.studio_id !== membership.studio_id) {
    return { formError: "The project was not found or is not available." };
  }

  const supabase = await createClient();
  const { data: targetMemberships, error: targetMembershipError } = await supabase
    .from("studio_members")
    .select("user_id, profile:profiles!studio_members_user_id_fkey!inner(is_active)")
    .eq("studio_id", project.studio_id)
    .eq("is_active", true)
    .eq("profile.is_active", true)
    .in("user_id", parsed.data.profileIds);

  if (targetMembershipError) {
    console.error("Unable to verify assignable studio members", targetMembershipError);
    return { formError: "The selected studio members could not be verified." };
  }
  if (targetMemberships?.length !== parsed.data.profileIds.length) {
    return { formError: "One or more selected profiles are not active members of this studio." };
  }

  const { data: existingAssignments, error: existingAssignmentError } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", project.id)
    .eq("is_active", true)
    .in("user_id", parsed.data.profileIds);

  if (existingAssignmentError) {
    console.error("Unable to check existing project assignments", existingAssignmentError);
    return { formError: "The project assignments could not be verified." };
  }
  if (existingAssignments?.length) {
    return { formError: "One or more studio members are already assigned to the project." };
  }

  const assignedAt = new Date().toISOString().slice(0, 10);
  const assignments: ProjectMemberInsert[] = parsed.data.profileIds.map((userId) => ({
    project_id: project.id,
    user_id: userId,
    project_role: "other",
    assigned_area_m2: 0,
    assigned_at: assignedAt,
  }));
  const { error: insertError } = await supabase.from("project_members").insert(assignments);
  if (insertError) {
    if (insertError.code === "23505") {
      return { formError: "One or more studio members are already assigned to the project." };
    }
    console.error("Unable to add project members", insertError);
    return { formError: "The project members could not be added. Please try again." };
  }

  revalidateProjectMembership(project.id);
  return { success: "added" };
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
