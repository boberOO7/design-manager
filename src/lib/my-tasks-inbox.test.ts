import { describe, expect, it } from "vitest";
import { getMyTasksInbox, type InboxFilters } from "./my-tasks-inbox";
import type { MyTask } from "@/types/tasks";
import type { MyOfficeAssignment } from "@/data/queries/office-assignments";

const today = "2026-09-25";
const filters: InboxFilters = { period: "all", search: "", project: "all", type: "all", state: "active" };

function task(id: string, projectId: string, deadline: string | null, status: MyTask["status"] = "todo"): MyTask {
  return {
    id, project_id: projectId, project: { id: projectId, name: projectId, status: "active", archived_at: null },
    title: `Task ${id}`, description: null, stage: "stage_1", status, priority: "normal", assignee_id: null,
    due_date: status === "completed" || status === "cancelled" ? null : deadline, deadlines: deadline ? [{ id: `deadline-${id}`, target_status: "completed", due_date: deadline }] : [],
    completed_at: null, completed_area_m2: null, manual_progress_override: false, production_completion: 0,
    progress_weight: 1, created_at: "2026-09-01T00:00:00Z", created_by: "creator",
    currentStatusEnteredAt: null, checklist_items: [], assignee: null, collaborators: [], creator: null,
  };
}

const assignments: MyOfficeAssignment[] = [
  { id: "office-overdue", title: "Urgent office", deadline: "2026-09-23", status: "assigned" },
  { id: "office-done", title: "Finished office", deadline: "2026-09-24", status: "done" },
  { id: "office-cancelled", title: "Cancelled office", deadline: null, status: "cancelled" },
];
const tasks = [
  task("late", "Alpha", "2026-09-24"), task("today", "Alpha", today), task("soon", "Alpha", "2026-09-26"),
  task("later", "Alpha", "2026-10-03"), task("none", "Alpha", null), task("done", "Alpha", "2026-09-20", "completed"),
  task("future", "Beta", "2026-09-27"), task("cancelled", "Beta", null, "cancelled"),
];

describe("My Tasks inbox", () => {
  it("orders groups and rows by active deadline urgency, leaving undated work last", () => {
    const groups = getMyTasksInbox(tasks, assignments, filters, today);
    expect(groups.map((group) => group.id)).toEqual(["office", "Alpha", "Beta"]);
    expect(groups.find((group) => group.id === "Alpha")?.items.map((item) => item.title)).toEqual([
      "Task late", "Task today", "Task soon", "Task later", "Task none",
    ]);
    expect(groups[0].items).toHaveLength(1);
  });

  it("shows completed work separately and keeps active rows ahead in All", () => {
    const completed = getMyTasksInbox(tasks, assignments, { ...filters, state: "completed" }, today);
    expect(completed.map((group) => [group.id, group.items.map((item) => item.title)])).toEqual([
      ["office", ["Finished office"]], ["Alpha", ["Task done"]],
    ]);
    const all = getMyTasksInbox(tasks, assignments, { ...filters, state: "all" }, today);
    expect(all.map((group) => [group.id, group.items.length])).toEqual([["office", 2], ["Alpha", 6], ["Beta", 1]]);
    expect(all.find((group) => group.id === "Alpha")?.items.at(-1)?.title).toBe("Task done");
    expect(getMyTasksInbox(tasks, assignments, { ...filters, state: "completed", type: "project", search: "done" }, today).map((group) => group.id)).toEqual(["Alpha"]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, state: "completed", project: "office" }, today)[0]?.items.map((item) => item.title)).toEqual(["Finished office"]);
  });

  it("applies period, title, project and type filters before counts and groups", () => {
    expect(getMyTasksInbox(tasks, assignments, { ...filters, period: "overdue" }, today).map((group) => [group.id, group.items.length])).toEqual([["office", 1], ["Alpha", 1]]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, period: "today" }, today).map((group) => [group.id, group.items.length])).toEqual([["Alpha", 1]]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, period: "week" }, today).map((group) => [group.id, group.items.length])).toEqual([["Alpha", 2], ["Beta", 1]]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, search: "URGENT", type: "office" }, today).map((group) => [group.id, group.items.length])).toEqual([["office", 1]]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, project: "Alpha", type: "office" }, today)).toEqual([]);
    expect(getMyTasksInbox(tasks, assignments, { ...filters, project: "Beta" }, today).map((group) => group.id)).toEqual(["Beta"]);
  });
});
