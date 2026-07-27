import {
  getAccessibleProjects,
  getDashboardMetrics,
  getEmployeeWorkload,
  getLeaderboard,
  getMyTasks,
  getProjectAreaProgress,
  getProjectById,
  getTeamMembers,
} from "@/data/mock";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import type {
  DashboardMetrics,
  EmployeeWorkloadSummary,
  LeaderboardEntry,
  Profile,
  Project,
  ProjectSummary,
  TaskSummary,
} from "@/types";

export type DataMode = "mock" | "supabase";

export function getDataMode(): DataMode {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "mock";
}

/**
 * Server-side profile fetcher - uses real Supabase authentication
 */
export const getCurrentUserProfile = cache(async (): Promise<Profile | null> => {
  if (getDataMode() === "mock") {
    // In mock mode, still use mock data for backward compatibility
    // but this will be replaced with real auth when Supabase is configured
    return null;
  }

  const supabase = await createClient();

  // Verify authentication using getClaims()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData) {
    return null;
  }

  // Extract authenticated user ID from claims
  const userId = claimsData.claims.sub;

  if (!userId) {
    return null;
  }

  // Query public.profiles for the row where id equals the authenticated user ID
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, avatar_url, job_title, system_role, is_active, created_at, updated_at"
    )
    .eq("id", userId)
    .single();

  if (profileError) {
    // Profile record not found - throw clear error with Supabase error message
    throw new Error(
      `Authenticated user exists but profile record is missing for user ID: ${userId}. Error: ${profileError.message}`
    );
  }

  if (profile.system_role !== "admin" && profile.system_role !== "employee") {
    throw new Error(`Profile has an unsupported system role for user ID: ${userId}.`);
  }

  return {
    ...profile,
    avatar_url: profile.avatar_url ?? undefined,
    system_role: profile.system_role,
  };
});

export function getDashboardData(): DashboardMetrics {
  return getDashboardMetrics();
}

export function getProjectsData(): ProjectSummary[] {
  return getAccessibleProjects();
}

type AccessibleProjectRow = Omit<Project, "total_area_m2"> & {
  total_area_m2: number | string;
  project_members: Array<{
    profiles: { full_name: string } | null;
  }> | null;
  project_area_progress: Array<{
    area_m2: number | string;
  }> | null;
};

type AccessibleProjectsResult =
  | { projects: ProjectSummary[]; error: null }
  | { projects: null; error: "query_failed" };

/**
 * Reads only the projects visible to the current authenticated user.
 * RLS determines access; this query intentionally adds no application-side
 * role or membership filtering.
 */
export async function getAccessibleProjectsFromSupabase(): Promise<AccessibleProjectsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(`
      id,
      studio_id,
      name,
      project_code,
      client_name,
      description,
      total_area_m2,
      status,
      priority,
      start_date,
      due_date,
      completed_at,
      archived_at,
      created_by,
      created_at,
      updated_at,
      project_members!left(
        profiles(full_name)
      ),
      project_area_progress(area_m2)
    `)
    .eq("project_members.is_active", true)
    .is("archived_at", null)
    .neq("status", "archived")
    .order("start_date", { ascending: false })
    .overrideTypes<AccessibleProjectRow[], { merge: false }>();

  if (error || !data) {
    console.error("Unable to load accessible projects", error);
    return { projects: null, error: "query_failed" };
  }

  const projects = data.map((project): ProjectSummary => {
    const completedArea = (project.project_area_progress ?? []).reduce(
      (total, entry) => total + Number(entry.area_m2),
      0,
    );
    const totalArea = Number(project.total_area_m2);
    const dueDate = project.due_date ? new Date(project.due_date) : null;

    return {
      ...project,
      total_area_m2: totalArea,
      completed_area_m2: completedArea,
      progress_percentage: totalArea > 0 ? Math.min(100, Math.round((completedArea / totalArea) * 100)) : 0,
      assigned_employees: (project.project_members ?? []).flatMap((member) =>
        member.profiles ? [member.profiles.full_name] : [],
      ),
      overdue: dueDate !== null && dueDate < new Date() && project.status !== "completed" && project.status !== "archived",
      memberCount: project.project_members?.length ?? 0,
    };
  });

  return { projects, error: null };
}

export function getProjectData(projectId: string): ProjectSummary | undefined {
  return getProjectById(projectId);
}

export function getMyTasksData(): TaskSummary[] {
  return getMyTasks();
}

export function getTeamData() {
  return getTeamMembers();
}

export function getEmployeeWorkloadData(): EmployeeWorkloadSummary[] {
  return getEmployeeWorkload();
}

export function getLeaderboardData(): LeaderboardEntry[] {
  return getLeaderboard();
}

export function getProjectProgressData(projectId: string) {
  return getProjectAreaProgress(projectId);
}
