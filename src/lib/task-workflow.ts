import type { TaskStatus } from "@/types/tasks";

export type BoardColumnId = "todo" | "in-progress" | "internal-review" | "client-review" | "done";
export type WritableTaskStatus = TaskStatus & ("todo" | "in_progress" | "internal_review" | "review" | "completed");

export const BOARD_COLUMNS: ReadonlyArray<{ id: BoardColumnId; label: string; status: WritableTaskStatus }> = [
  { id: "todo", label: "To do", status: "todo" },
  { id: "in-progress", label: "In progress", status: "in_progress" },
  { id: "internal-review", label: "Internal review", status: "internal_review" },
  { id: "client-review", label: "Client review", status: "review" },
  { id: "done", label: "Done", status: "completed" },
];

export const DEFAULT_STAGE_COLUMN_STATUSES = ["todo", "in_progress", "internal_review", "review", "completed"] as const satisfies readonly WritableTaskStatus[];
