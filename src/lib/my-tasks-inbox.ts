import type { MyOfficeAssignment } from "@/data/queries/office-assignments";
import { isOfficeAssignmentOverdue } from "@/lib/office-assignments";
import { isTaskOverdue } from "@/lib/tasks";
import type { MyTask } from "@/types/tasks";

export type InboxItem =
  | { kind: "project"; task: MyTask; title: string; deadline: string | null; overdue: boolean; completed: boolean }
  | { kind: "office"; assignment: MyOfficeAssignment; title: string; deadline: string | null; overdue: boolean; completed: boolean };

export type InboxGroup = { id: string; name: string; status: string | null; items: InboxItem[] };
export type InboxFilters = { period: "all" | "overdue" | "today" | "week"; search: string; project: string; type: "all" | "project" | "office"; state: "active" | "completed" | "all" };

function compareItems(left: InboxItem, right: InboxItem): number {
  if (left.completed !== right.completed) return left.completed ? 1 : -1;
  if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
  if (left.deadline !== right.deadline) {
    if (!left.deadline) return 1;
    if (!right.deadline) return -1;
    return left.deadline.localeCompare(right.deadline);
  }
  return left.title.localeCompare(right.title);
}

export function getMyTasksInbox(tasks: MyTask[], assignments: MyOfficeAssignment[], filters: InboxFilters, today: string): InboxGroup[] {
  const search = filters.search.trim().toLocaleLowerCase();
  const weekEnd = new Date(`${today}T00:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndDate = weekEnd.toISOString().slice(0, 10);
  const groups = new Map<string, InboxGroup>();

  function include(item: InboxItem): boolean {
    if (search && !item.title.toLocaleLowerCase().includes(search)) return false;
    if (filters.period === "overdue") return item.overdue;
    if (filters.period === "today") return item.deadline === today;
    if (filters.period === "week") return item.deadline !== null && item.deadline >= today && item.deadline <= weekEndDate;
    return true;
  }

  if (filters.type !== "office") for (const task of tasks) {
    const completed = task.status === "completed";
    if (task.status === "cancelled" || (filters.state === "active" && completed) || (filters.state === "completed" && !completed) || (filters.project !== "all" && filters.project !== task.project_id)) continue;
    const item: InboxItem = { kind: "project", task, title: task.title, deadline: task.due_date, overdue: isTaskOverdue(task, today), completed };
    if (!include(item)) continue;
    const group = groups.get(task.project_id) ?? { id: task.project_id, name: task.project.name, status: task.project.status, items: [] };
    group.items.push(item);
    groups.set(group.id, group);
  }
  if (filters.type !== "project" && (filters.project === "all" || filters.project === "office")) for (const assignment of assignments) {
    const completed = assignment.status === "done";
    if (assignment.status === "cancelled" || (filters.state === "active" && completed) || (filters.state === "completed" && !completed)) continue;
    const item: InboxItem = { kind: "office", assignment, title: assignment.title, deadline: assignment.deadline, overdue: isOfficeAssignmentOverdue(assignment.deadline, assignment.status, today), completed };
    if (!include(item)) continue;
    const group = groups.get("office") ?? { id: "office", name: "", status: null, items: [] };
    group.items.push(item);
    groups.set(group.id, group);
  }
  return [...groups.values()].map((group) => ({ ...group, items: group.items.sort(compareItems) }))
    .sort((left, right) => compareItems(left.items[0], right.items[0]) || left.name.localeCompare(right.name));
}
