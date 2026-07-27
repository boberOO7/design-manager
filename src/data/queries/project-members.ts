import "server-only";

import { getProjectById } from "@/data/queries/project-by-id";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { ProjectMemberRow } from "@/types/project-members";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type ProjectMemberWithProfile = Pick<
  ProjectMemberRow,
  "id" | "project_id" | "user_id" | "assigned_at"
> & {
  profile: Pick<ProfileRow, "id" | "full_name" | "job_title">;
};

export type AssignableStudioMember = Pick<
  ProfileRow,
  "id" | "full_name" | "job_title"
>;

export async function getProjectMembers(projectId: string): Promise<ProjectMemberWithProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select(
      "id, project_id, user_id, assigned_at, profile:profiles!project_members_user_id_fkey!inner(id, full_name, job_title)",
    )
    .eq("project_id", projectId)
    .eq("is_active", true);

  if (error || !data) {
    throw new Error(`Unable to load project members for project ${projectId}.`, {
      cause: error,
    });
  }

  return data.sort((left, right) =>
    left.profile.full_name.localeCompare(right.profile.full_name),
  );
}

export async function getAssignableStudioMembers(
  projectId: string,
): Promise<AssignableStudioMember[]> {
  const project = await getProjectById(projectId);
  if (!project) return [];

  const supabase = await createClient();
  const [assignmentsResult, studioMembersResult] = await Promise.all([
    supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", project.id)
      .eq("is_active", true),
    supabase
      .from("studio_members")
      .select("user_id")
      .eq("studio_id", project.studio_id)
      .eq("is_active", true),
  ]);

  if (assignmentsResult.error || !assignmentsResult.data) {
    throw new Error(`Unable to resolve current assignments for project ${projectId}.`, {
      cause: assignmentsResult.error,
    });
  }

  if (studioMembersResult.error || !studioMembersResult.data) {
    throw new Error(`Unable to load active studio members for project ${projectId}.`, {
      cause: studioMembersResult.error,
    });
  }

  const assignedUserIds = new Set(assignmentsResult.data.map((assignment) => assignment.user_id));
  const assignableUserIds = studioMembersResult.data
    .map((member) => member.user_id)
    .filter((userId) => !assignedUserIds.has(userId));

  if (assignableUserIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, job_title")
    .in("id", assignableUserIds)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (profilesError || !profiles) {
    throw new Error(`Unable to load assignable profiles for project ${projectId}.`, {
      cause: profilesError,
    });
  }

  return profiles;
}
