import {
  getAccessibleProjects,
  getDashboardMetrics,
  getEmployeeWorkload,
  getMyTasks,
  getProjectAreaProgress,
  getProjectById,
} from "@/data/mock";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import type {
  DashboardMetrics,
  EmployeeWorkloadSummary,
  Profile,
  Project,
  ProjectSummary,
  TaskSummary,
} from "@/types";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getStudioLeaderboardBonusConfig } from "@/data/queries/leaderboard-bonus-rules";
import type { LeaderboardBonusConfig } from "@/lib/leaderboard-bonus-rules";
import { filterProductivityAttributionsForPeriod, getKyivPeriodBounds, projectProductivityLeaderboard, type CompletedProductivityAttribution, type LeaderboardPeriod, type ProductivityLeaderboardEntry } from "@/lib/productivity";

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

  // getUser() verifies the session with Supabase Auth instead of trusting JWT
  // claims alone. A deleted Auth user can otherwise retain a locally valid JWT
  // until it expires (for example, after a local database reset).
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    return null;
  }

  // Query public.profiles for the row where id equals the authenticated user ID
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, avatar_url, country_code, city, city_geonames_id, job_title, system_role, is_active, created_at, updated_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to load the authenticated user's profile for user ID: ${user.id}.`, { cause: profileError });
  }

  if (!profile) {
    throw new Error(`Authenticated Auth user is missing its required profile record for user ID: ${user.id}.`);
  }

  if (profile.system_role !== "admin" && profile.system_role !== "employee") {
    throw new Error(`Profile has an unsupported system role for user ID: ${user.id}.`);
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

export function getEmployeeWorkloadData(): EmployeeWorkloadSummary[] {
  return getEmployeeWorkload();
}

async function getLeaderboardForPeriod(studioId: string, period: LeaderboardPeriod, periodOffset: number): Promise<ProductivityLeaderboardEntry[]> {
  const bounds = getKyivPeriodBounds(period, undefined, periodOffset);
  const supabase = await createClient();
  const [{ data: projects, error: projectsError }, { data, error }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, include_in_productivity")
      .eq("studio_id", studioId)
      .overrideTypes<Array<{ id: string; include_in_productivity: boolean }>, { merge: false }>(),
    supabase
    .from("productivity_attributions")
    .select("project_id, contributor_id, contributor_name, contributor_job_title, credited_area_m2, source_type, completed_at")
    .eq("studio_id", studioId)
    .is("voided_at", null)
    .gte("completed_at", bounds.start)
    .lt("completed_at", bounds.end)
    .overrideTypes<Array<CompletedProductivityAttribution & { project_id: string }>, { merge: false }>(),
  ]);
  if (projectsError || !projects || error || !data) {
    console.error("Unable to load productivity.", projectsError ?? error);
    throw new Error("Unable to load productivity.", { cause: projectsError ?? error });
  }
  const excludedProjectIds = new Set(projects.filter((project) => !project.include_in_productivity).map((project) => project.id));
  return projectProductivityLeaderboard(filterProductivityAttributionsForPeriod(data.filter((attribution) => !excludedProjectIds.has(attribution.project_id)), period));
}

export async function getLeaderboardOverviewData(period: LeaderboardPeriod = "month"): Promise<{ current: ProductivityLeaderboardEntry[]; previous: ProductivityLeaderboardEntry[]; bonusConfig: LeaderboardBonusConfig }> {
  const [profile, membership] = await Promise.all([getCurrentUserProfile(), getActiveStudioMembership()]);
  if (!profile || !profile.is_active || !membership || membership.authenticatedUserId !== profile.id) return { current: [], previous: [], bonusConfig: { enabled: false, rules: [] } };
  const [current, previous, bonusConfig] = await Promise.all([
    getLeaderboardForPeriod(membership.studio_id, period, 0),
    getLeaderboardForPeriod(membership.studio_id, period, -1),
    getStudioLeaderboardBonusConfig(membership.studio_id),
  ]);
  const contributorIds = [...new Set([...current, ...previous].map((entry) => entry.user_id))];
  if (contributorIds.length === 0) return { current, previous, bonusConfig };
  const supabase = await createClient();
  const { data: contributors, error } = await supabase
    .from("profiles")
    .select("id, avatar_url")
    .in("id", contributorIds);
  if (error || !contributors) throw new Error("Unable to load contributor avatars.", { cause: error });
  const avatarByContributorId = new Map(contributors.map((contributor) => [contributor.id, contributor.avatar_url]));
  const attachAvatars = (entries: ProductivityLeaderboardEntry[]) => entries.map((entry) => ({ ...entry, avatar_url: avatarByContributorId.get(entry.user_id) ?? null }));
  return { current: attachAvatars(current), previous: attachAvatars(previous), bonusConfig };
}

export async function getLeaderboardData(): Promise<ProductivityLeaderboardEntry[]> {
  return (await getLeaderboardOverviewData()).current;
}

export function getProjectProgressData(projectId: string) {
  return getProjectAreaProgress(projectId);
}
