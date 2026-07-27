import type { Database } from "@/types/database.types";

export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export const TASK_STATUS_VALUES = [
  "todo",
  "in_progress",
  "review",
  "completed",
  "cancelled",
] as const;

export const TASK_PRIORITY_VALUES = ["low", "normal", "high", "urgent"] as const;

export type TaskStatus = TaskRow["status"] & (typeof TASK_STATUS_VALUES)[number];
export type TaskPriority = TaskRow["priority"] & (typeof TASK_PRIORITY_VALUES)[number];

type ProfileSummary = {
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
  | "due_date"
  | "completed_at"
  | "created_at"
> & {
  assignee: ProfileSummary | null;
};

export type MyTask = Pick<
  TaskRow,
  | "id"
  | "project_id"
  | "title"
  | "status"
  | "priority"
  | "assignee_id"
  | "due_date"
  | "completed_at"
  | "created_at"
> & {
  project: { id: string; name: string };
};
