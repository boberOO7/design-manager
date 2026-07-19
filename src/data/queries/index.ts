import {
  currentUserMockId,
  getAccessibleProjects,
  getCurrentUser,
  getDashboardMetrics,
  getEmployeeWorkload,
  getLeaderboard,
  getMyTasks,
  getProjectAreaProgress,
  getProjectById,
  getTeamMembers,
} from "@/data/mock";
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

export function getCurrentUserProfile(): Profile {
  return getCurrentUser();
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

export function getCurrentUserId() {
  return currentUserMockId;
}
