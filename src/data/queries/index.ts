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
import type {
  DashboardMetrics,
  EmployeeWorkloadSummary,
  LeaderboardEntry,
  Profile,
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
export async function getCurrentUserProfile(): Promise<Profile | null> {
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
  const userId = claimsData.claims.sub as string | undefined;

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

  return profile;
}

export function getDashboardData(): DashboardMetrics {
  return getDashboardMetrics();
}

export function getProjectsData(): ProjectSummary[] {
  return getAccessibleProjects();
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
