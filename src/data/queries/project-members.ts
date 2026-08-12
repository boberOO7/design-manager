import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { ProjectMemberRow } from "@/types/project-members";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

export type ProjectMemberWithProfile = Pick<
  ProjectMemberRow,
  "id" | "project_id" | "user_id" | "assigned_at"
> & {
  profile: Pick<ProfileRow, "id" | "full_name" | "job_title" | "is_active" | "avatar_url">;
};

export type AssignableStudioMember = Pick<
  ProfileRow,
  "id" | "full_name" | "job_title"
>;

export type AssignableProjectMember = Pick<
  ProfileRow,
  "id" | "full_name" | "job_title"
>;

export async function getProjectMembers(projectId: string): Promise<ProjectMemberWithProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .select(
      "id, project_id, user_id, assigned_at, profile:profiles!project_members_user_id_fkey!inner(id, full_name, job_title, is_active, avatar_url)",
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

export async function getAssignableProjectMembers(
  projectId: string,
  projectStudioId: string,
): Promise<AssignableProjectMember[]> {
  const members = await getProjectMembers(projectId);
  const activeProfileMembers = members.filter(({ profile }) => profile.is_active);
  if (activeProfileMembers.length === 0) return [];

  const supabase = await createClient();
  const { data: activeStudioMembers, error } = await supabase
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", projectStudioId)
    .eq("is_active", true)
    .in("user_id", activeProfileMembers.map(({ user_id }) => user_id));

  if (error || !activeStudioMembers) {
    throw new Error(`Unable to verify active task assignees for project ${projectId}.`, {
      cause: error,
    });
  }

  const activeStudioUserIds = new Set(activeStudioMembers.map(({ user_id }) => user_id));
  return members
    .filter(({ profile }) => profile.is_active && activeStudioUserIds.has(profile.id))
    .map(({ profile }) => ({
      id: profile.id,
      full_name: profile.full_name,
      job_title: profile.job_title,
    }));
}

export async function getAssignableStudioMembers(
  project: Pick<ProjectRow, "id" | "studio_id">,
  assignedUserIds: string[],
): Promise<AssignableStudioMember[]> {
  const supabase = await createClient();
  const studioMembersResult = await supabase
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", project.studio_id)
    .eq("is_active", true);

  if (studioMembersResult.error || !studioMembersResult.data) {
    throw new Error(`Unable to load active studio members for project ${project.id}.`, {
      cause: studioMembersResult.error,
    });
  }

  const assignedUserIdSet = new Set(assignedUserIds);
  const assignableUserIds = studioMembersResult.data
    .map((member) => member.user_id)
    .filter((userId) => !assignedUserIdSet.has(userId));

  if (assignableUserIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, job_title")
    .in("id", assignableUserIds)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (profilesError || !profiles) {
    throw new Error(`Unable to load assignable profiles for project ${project.id}.`, {
      cause: profilesError,
    });
  }

  return profiles;
}
