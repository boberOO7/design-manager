export type SystemRole = "admin" | "employee";
export type ProjectStatus = "planned" | "active" | "paused" | "completed" | "archived";
export type ProjectPriority = "low" | "normal" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "review" | "completed" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type ProjectRole = "lead_designer" | "designer" | "visualizer" | "architect" | "manager" | "other";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  job_title: string;
  system_role: SystemRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  studio_id: string;
  name: string;
  project_code?: string | null;
  client_name?: string | null;
  description?: string | null;
  total_area_m2: number;
  status: ProjectStatus;
  priority: ProjectPriority;
  start_date: string;
  due_date?: string | null;
  completed_at?: string | null;
  archived_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
  created_by: string;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardMetrics {
  activeProjectsCount: number;
  activeTotalArea: number;
  completedArea: number;
  remainingArea: number;
  overdueProjects: number;
  overdueTasks: number;
  openTasks: number;
  completedTasksPeriod: number;
  recentProductivity: number;
  workload: Array<{
    userId: string;
    fullName: string;
    assignedArea: number;
    status: "overloaded" | "balanced" | "underloaded";
  }>;
}

export interface TeamMember {
  id: string;
  project_id: string;
  user_id: string;
  project_role: ProjectRole;
  assigned_area_m2: number;
  is_active: boolean;
  assigned_at: string;
  removed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectAreaProgressEntry {
  id: string;
  project_id: string;
  user_id: string;
  area_m2: number;
  progress_date: string;
  note?: string | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummary extends Project {
  completed_area_m2: number;
  progress_percentage: number;
  assigned_employees: string[];
  overdue: boolean;
  memberCount: number;
}

export interface TaskSummary extends Task {
  project_name: string;
  assignee_name: string;
  assignee_avatar?: string;
  overdue: boolean;
}

export interface EmployeeWorkloadSummary {
  user_id: string;
  full_name: string;
  job_title: string;
  avatar_url?: string;
  active_project_count: number;
  assigned_area_m2: number;
  completed_area_m2: number;
  remaining_area_m2: number;
  open_tasks: number;
  overdue_tasks: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string;
  avatar_url?: string;
  job_title: string;
  completed_area_m2: number;
  completed_tasks: number;
  completed_projects: number;
  current_workload_m2: number;
  rank_change?: number;
}

export interface AuthSession {
  user: Profile;
  role: SystemRole;
  isMock: boolean;
}
