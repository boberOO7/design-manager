import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canUpdateProjectMetadata, canWorkOnTaskInProject, countOpenLifecycleTasks, getAutomaticProjectStatus, getLifecycleCompletedAt, getRestoredProjectStatus, getTaskCreationStagesForProject, hasProgressedEligibleTasks, isOperationalProjectStatus, isValidArchiveState, OPERATIONAL_PROJECT_STATUSES, validateLifecycleTransition } from "./project-lifecycle";
import { TASK_STAGES } from "./task-stages";
import { isWritableTaskStatus } from "./tasks";
import { editProjectSchema } from "./validation/project";

const lifecycleMutationSource = readFileSync(resolve(process.cwd(), "src/data/mutations/project-lifecycle.ts"), "utf8");

describe("automatic project activation", () => {
  it("keeps planned projects planned without work or with only todo work", () => {
    expect(getAutomaticProjectStatus("planned", "todo")).toBe("planned");
    expect(countOpenLifecycleTasks([])).toBe(0);
  });
  it.each(["in_progress", "internal_review", "review", "completed"])("activates a planned project when a task enters %s", (status) => {
    expect(getAutomaticProjectStatus("planned", status)).toBe("active");
  });
  it("does not activate from cancelled work or reverse any stored lifecycle state", () => {
    expect(getAutomaticProjectStatus("planned", "cancelled")).toBe("planned");
    expect(getAutomaticProjectStatus("active", "todo")).toBe("active");
    expect(getAutomaticProjectStatus("paused", "completed")).toBe("paused");
    expect(getAutomaticProjectStatus("completed", "in_progress")).toBe("completed");
    expect(getAutomaticProjectStatus("planned", "in_progress", "stage_4")).toBe("planned");
  });
  it("defines paused work outside the operational query boundary and restores it on resume", () => {
    expect(OPERATIONAL_PROJECT_STATUSES).toEqual(["planned", "active"]);
    expect(isOperationalProjectStatus("paused")).toBe(false);
    expect(isOperationalProjectStatus("active")).toBe(true);
  });
  it("restores a planned lifecycle display when an optimistic task move fails", () => {
    const previousProjectStatus = "planned";
    const optimisticProjectStatus = getAutomaticProjectStatus(previousProjectStatus, "in_progress");
    expect(optimisticProjectStatus).toBe("active");
    expect(previousProjectStatus).toBe("planned");
  });
});

describe("manual lifecycle transitions", () => {
  const todo = [{ stage: "stage_1", status: "todo" }];
  const progressed = [{ stage: "stage_1", status: "in_progress" }];
  it("allows the supported active workflow", () => {
    expect(validateLifecycleTransition({ from: "planned", to: "active", openTaskCount: 1, hasProgressedEligibleTasks: false }).valid).toBe(true);
    expect(validateLifecycleTransition({ from: "active", to: "paused", openTaskCount: 1, hasProgressedEligibleTasks: true }).valid).toBe(true);
    expect(validateLifecycleTransition({ from: "paused", to: "active", openTaskCount: 1, hasProgressedEligibleTasks: true }).valid).toBe(true);
    expect(validateLifecycleTransition({ from: "completed", to: "active", openTaskCount: 0, hasProgressedEligibleTasks: true }).valid).toBe(true);
  });
  it("permits completion only after all tasks close", () => {
    expect(validateLifecycleTransition({ from: "active", to: "completed", openTaskCount: 0, hasProgressedEligibleTasks: false }).valid).toBe(true);
    expect(validateLifecycleTransition({ from: "paused", to: "completed", openTaskCount: 2, hasProgressedEligibleTasks: true })).toMatchObject({ valid: false, reason: "open_tasks" });
  });
  it("ignores post-completion work when evaluating project completion", () => {
    const tasks = [
      { stage: "stage_1", status: "completed" },
      { stage: "stage_2", status: "cancelled" },
      { stage: "stage_3", status: "completed" },
      { stage: "stage_4", status: "todo" },
    ];
    expect(countOpenLifecycleTasks(tasks)).toBe(0);
    expect(hasProgressedEligibleTasks(tasks)).toBe(true);
    expect(validateLifecycleTransition({ from: "active", to: "completed", openTaskCount: countOpenLifecycleTasks(tasks), hasProgressedEligibleTasks: true }).valid).toBe(true);
  });
  it("keeps completed projects writable only for post-completion tasks", () => {
    expect(canWorkOnTaskInProject({ projectStatus: "completed", stage: "stage_4" })).toBe(true);
    expect(canWorkOnTaskInProject({ projectStatus: "completed", stage: "stage_3" })).toBe(false);
    expect(canWorkOnTaskInProject({ projectStatus: "archived", archivedAt: "2026-09-03", stage: "stage_4" })).toBe(false);
  });
  it("derives task-creation choices from the canonical stage order and project lifecycle", () => {
    expect(getTaskCreationStagesForProject({ projectStatus: "active" })).toEqual(TASK_STAGES);
    expect(getTaskCreationStagesForProject({ projectStatus: "completed" })).toEqual(["stage_4"]);
    expect(getTaskCreationStagesForProject({ projectStatus: "archived", archivedAt: "2026-09-03" })).toEqual([]);
  });
  it("returns paused projects to planned only before eligible work progresses", () => {
    expect(hasProgressedEligibleTasks(todo)).toBe(false);
    expect(validateLifecycleTransition({ from: "paused", to: "planned", openTaskCount: 1, hasProgressedEligibleTasks: false }).valid).toBe(true);
    expect(hasProgressedEligibleTasks(progressed)).toBe(true);
    expect(validateLifecycleTransition({ from: "paused", to: "planned", openTaskCount: 1, hasProgressedEligibleTasks: true })).toMatchObject({ valid: false, reason: "progressed_tasks" });
  });
  it("rejects invalid and archive-only transitions from the normal endpoint", () => {
    expect(validateLifecycleTransition({ from: "planned", to: "completed", openTaskCount: 0, hasProgressedEligibleTasks: false })).toMatchObject({ valid: false, reason: "invalid_transition" });
    expect(validateLifecycleTransition({ from: "active", to: "archived", openTaskCount: 0, hasProgressedEligibleTasks: false })).toMatchObject({ valid: false, reason: "invalid_transition" });
  });
  it("preserves established archive restoration targets", () => {
    expect(getRestoredProjectStatus(true)).toBe("completed");
    expect(getRestoredProjectStatus(false)).toBe("paused");
  });
  it("rejects archived-at changes that do not match the archive status", () => {
    expect(isValidArchiveState("active", "2026-07-28")).toBe(false);
    expect(isValidArchiveState("archived", null)).toBe(false);
    expect(isValidArchiveState("archived", "2026-07-28")).toBe(true);
    expect(isValidArchiveState("active", null)).toBe(true);
  });
  it("exposes Client review while keeping cancelled outside the writable task-status boundary", () => {
    expect(isWritableTaskStatus("todo")).toBe(true);
    expect(isWritableTaskStatus("in_progress")).toBe(true);
    expect(isWritableTaskStatus("completed")).toBe(true);
    expect(isWritableTaskStatus("review")).toBe(true);
    expect(isWritableTaskStatus("cancelled")).toBe(false);
  });
  it("keeps completion dates consistent across complete, archive, restore, and reopen", () => {
    const completedAt = getLifecycleCompletedAt({ from: "active", to: "completed", completedAt: null, today: "2026-07-28" });
    expect(completedAt).toBe("2026-07-28");
    expect(getLifecycleCompletedAt({ from: "completed", to: "archived", completedAt, today: "2026-07-29" })).toBe(completedAt);
    expect(getRestoredProjectStatus(completedAt !== null)).toBe("completed");
    expect(getLifecycleCompletedAt({ from: "completed", to: "active", completedAt, today: "2026-07-29" })).toBeNull();
  });
  it("keeps pause separate from productivity history and task/deadline data", () => {
    expect(getLifecycleCompletedAt({ from: "active", to: "paused", completedAt: null, today: "2026-07-29" })).toBeNull();
    expect(lifecycleMutationSource).not.toContain("include_in_productivity");
    expect(lifecycleMutationSource).not.toContain("due_date");
    expect(lifecycleMutationSource).toContain('.update({ status: requestedStatus, completed_at:');
  });
  it("makes completed project metadata read-only", () => {
    expect(canUpdateProjectMetadata("completed")).toBe(false);
    expect(canUpdateProjectMetadata("active")).toBe(true);
  });
  it("rejects lifecycle status in the normal project-edit validator", () => {
    expect(editProjectSchema.safeParse({ name: "Project", project_type: "", country_code: "UA", city: "", client_name: "", description: "", total_area_m2: 10, priority: "normal", start_date: "2026-07-28", due_date: "", status: "active" }).success).toBe(false);
  });
});
