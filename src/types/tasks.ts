import type { Database } from "@/types/database.types";
import type { TaskStage } from "@/lib/task-stages";

export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
export type TaskChecklistItem = Database["public"]["Tables"]["task_checklist_items"]["Row"];

export const TASK_STATUS_VALUES = [
  "todo",
  "in_progress",
  "internal_review",
  "review",
  "completed",
  "cancelled",
] as const;

export const TASK_PRIORITY_VALUES = ["low", "normal", "high", "urgent"] as const;

export type TaskStatus = TaskRow["status"] & (typeof TASK_STATUS_VALUES)[number];
export type TaskPriority = TaskRow["priority"] & (typeof TASK_PRIORITY_VALUES)[number];
export type { TaskStage } from "@/lib/task-stages";

type ProfileSummary = {
  avatar_url?: string | null;
  id: string;
  full_name: string;
  job_title: string;
};

export type ProjectTask = Pick<
  TaskRow,
  | "id"
  | "project_id"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "assignee_id"
  | "created_by"
  | "due_date"
  | "completed_at"
  | "created_at"
  | "production_completion"
  | "progress_weight"
> & {
  stage: TaskStage;
  completed_area_m2: TaskRow["completed_area_m2"];
  checklist_items: TaskChecklistItem[];
  assignee: ProfileSummary | null;
  creator: ProfileSummary | null;
};

export type MyTask = ProjectTask & {
  project: { id: string; name: string; status: string; archived_at: string | null };
};
