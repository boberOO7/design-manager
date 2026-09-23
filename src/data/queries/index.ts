import {
  getAccessibleProjects,
  getDashboardMetrics,
  getEmployeeWorkload,
  getMyTasks,
  getProjectAreaProgress,
  getProjectById,
} from "@/data/mock";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { canAccessLeaderboard } from "@/lib/leaderboard-access";
import type { LeaderboardBonusConfig } from "@/lib/leaderboard-bonus-rules";
import { PROFESSIONAL_ROLES } from "@/lib/validation/employee-invitation";
import { getKyivPeriodBounds, projectProductivityContributions, projectProductivityLeaderboard, selectLeaderboardAttributions, type LeaderboardPeriod, type ProductivityContributionAttribution, type ProductivityLeaderboardEntry, type ProductivityLeaderboardMember, type ProductivityProjectContribution } from "@/lib/productivity";

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
      "id, full_name, email, avatar_url, birth_date, country_code, city, city_geonames_id, job_title, system_role, is_active, notification_popups_enabled, notification_sound_enabled, created_at, updated_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to load the authenticated user's profile for user ID: ${user.id}.`, { cause: profileError });
  }

  if (!profile) {
    // Route layouts and pages can render concurrently. After a local database
    // reset, a stale browser session may reach a page profile query while the
    // authenticated layout is already redirecting through access recovery.
    // Treat a genuinely absent row like an unavailable authenticated profile;
    // database/query failures above remain hard errors.
    return null;
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

type LeaderboardPeriodData = {
  entries: ProductivityLeaderboardEntry[];
  contributions: Record<string, ProductivityProjectContribution[]>;
};

async function getLeaderboardForPeriod(studioId: string, period: LeaderboardPeriod, periodOffset: number, referenceTime: Date, includeContributions = false): Promise<LeaderboardPeriodData> {
  const bounds = getKyivPeriodBounds(period, referenceTime, periodOffset);
  const supabase = await createClient();
  const [{ data: members, error: membersError }, { data: firstAttributions, count, error: attributionError }] = await Promise.all([
    supabase
      .from("studio_members")
      .select("profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url)")
      .eq("studio_id", studioId)
      .eq("is_active", true)
      .eq("profile.is_active", true)
      .in("profile.job_title", PROFESSIONAL_ROLES)
      .overrideTypes<Array<{ profile: { id: string; full_name: string; job_title: string; avatar_url: string | null } }>, { merge: false }>(),
    supabase.from("productivity_attributions")
      .select("id, project_id, task_id, contributor_id, contributor_name, contributor_job_title, credited_area_m2, source_type, task_stage, completed_at", { count: "exact" })
      .eq("studio_id", studioId)
      .is("voided_at", null)
      .gte("completed_at", bounds.start)
      .lt("completed_at", bounds.end)
      .order("completed_at", { ascending: false }).order("id", { ascending: false }).range(0, 999)
      .overrideTypes<ProductivityContributionAttribution[], { merge: false }>(),
  ]);
  if (membersError || !members || attributionError || !firstAttributions || count == null) {
    const cause = membersError ?? attributionError;
    console.error("Unable to load productivity.", cause);
    throw new Error("Unable to load productivity.", { cause });
  }
  const attributions = [...firstAttributions];
  while (attributions.length < count) {
    const { data, error } = await supabase.from("productivity_attributions")
      .select("id, project_id, task_id, contributor_id, contributor_name, contributor_job_title, credited_area_m2, source_type, task_stage, completed_at")
      .eq("studio_id", studioId).is("voided_at", null).gte("completed_at", bounds.start).lt("completed_at", bounds.end)
      .order("completed_at", { ascending: false }).order("id", { ascending: false }).range(attributions.length, attributions.length + 999)
      .overrideTypes<ProductivityContributionAttribution[], { merge: false }>();
    if (error || !data?.length) {
      const cause = error ?? new Error("An attribution page was empty before the selected period was fully loaded.");
      console.error("Unable to load productivity.", cause);
      throw new Error("Unable to load productivity.", { cause });
    }
    attributions.push(...data);
  }

  // Project flags are studio-wide accounting inputs; project names still follow the viewer's RLS.
  const projectIds = [...new Set(attributions.map((attribution) => attribution.project_id))];
  const excludedProjectIds = new Set<string>();
  if (projectIds.length) {
    const admin = createAdminClient();
    for (let index = 0; index < projectIds.length; index += 100) {
      const { data, error } = await admin.from("projects").select("id, include_in_productivity").eq("studio_id", studioId).in("id", projectIds.slice(index, index + 100));
      if (error || !data) {
        const cause = error;
        console.error("Unable to load productivity.", cause);
        throw new Error("Unable to load productivity.", { cause });
      }
      for (const project of data) if (!project.include_in_productivity) excludedProjectIds.add(project.id);
    }
  }
  const eligibleMembers: ProductivityLeaderboardMember[] = members.map(({ profile }) => ({
    user_id: profile.id,
    full_name: profile.full_name,
    job_title: profile.job_title,
    avatar_url: profile.avatar_url,
  }));
  const selected = selectLeaderboardAttributions(attributions, excludedProjectIds);
  const entries = projectProductivityLeaderboard(selected, eligibleMembers);
  if (!includeContributions) return { entries, contributions: {} };

  const eligibleIds = new Set(eligibleMembers.map((member) => member.user_id));
  const visibleProjectIds = [...new Set(selected.flatMap((attribution) => Number(attribution.credited_area_m2) > 0 && eligibleIds.has(attribution.contributor_id) ? [attribution.project_id] : []))];
  const projectNames = new Map<string, string>();
  for (let index = 0; index < visibleProjectIds.length; index += 100) {
    const { data, error } = await supabase.from("projects").select("id, name").eq("studio_id", studioId).in("id", visibleProjectIds.slice(index, index + 100));
    if (error || !data) {
      console.error("Unable to load productivity project names.", error);
      continue;
    }
    for (const project of data) projectNames.set(project.id, project.name);
  }
  const taskIds = [...new Set(selected.flatMap((attribution) => attribution.task_id && Number(attribution.credited_area_m2) > 0 && eligibleIds.has(attribution.contributor_id) ? [attribution.task_id] : []))];
  const taskTitles = new Map<string, string>();
  for (let index = 0; index < taskIds.length; index += 100) {
    const { data, error } = await supabase.from("tasks").select("id, title").in("id", taskIds.slice(index, index + 100));
    if (error || !data) {
      console.error("Unable to load productivity task names.", error);
      continue;
    }
    for (const task of data) taskTitles.set(task.id, task.title);
  }
  return { entries, contributions: projectProductivityContributions(selected, eligibleMembers, projectNames, taskTitles) };
}

export async function getLeaderboardOverviewData(period: LeaderboardPeriod = "month"): Promise<{ current: ProductivityLeaderboardEntry[]; previous: ProductivityLeaderboardEntry[]; contributions: Record<string, ProductivityProjectContribution[]>; bonusConfig: LeaderboardBonusConfig }> {
  const [profile, membership] = await Promise.all([getCurrentUserProfile(), getActiveStudioMembership()]);
  if (!profile || !profile.is_active || !membership || membership.authenticatedUserId !== profile.id) return { current: [], previous: [], contributions: {}, bonusConfig: { enabled: false, rules: [] } };
  if (!canAccessLeaderboard({ systemRole: membership.system_role, leaderboardVisibleToEmployees: membership.leaderboardVisibleToEmployees })) {
    return { current: [], previous: [], contributions: {}, bonusConfig: { enabled: false, rules: [] } };
  }
  const referenceTime = new Date();
  const [current, previous, bonusConfig] = await Promise.all([
    getLeaderboardForPeriod(membership.studio_id, period, 0, referenceTime, true),
    getLeaderboardForPeriod(membership.studio_id, period, -1, referenceTime),
    getStudioLeaderboardBonusConfig(membership.studio_id),
  ]);
  return { current: current.entries, previous: previous.entries, contributions: current.contributions, bonusConfig };
}

export async function getLeaderboardData(): Promise<ProductivityLeaderboardEntry[]> {
  return (await getLeaderboardOverviewData()).current;
}

export function getProjectProgressData(projectId: string) {
  return getProjectAreaProgress(projectId);
}
