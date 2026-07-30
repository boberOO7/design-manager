import { describe, expect, it } from "vitest";
import { canUpdateProjectMetadata, countOpenLifecycleTasks, getAutomaticProjectStatus, getLifecycleCompletedAt, getRestoredProjectStatus, hasProgressedEligibleTasks, isValidArchiveState, validateLifecycleTransition } from "./project-lifecycle";
import { isWritableTaskStatus } from "./tasks";
import { editProjectSchema } from "./validation/project";

describe("automatic project activation", () => {
  it("keeps planned projects planned without work or with only todo work", () => {
    expect(getAutomaticProjectStatus("planned", "todo")).toBe("planned");
    expect(countOpenLifecycleTasks([])).toBe(0);
  });
  it.each(["in_progress", "review", "completed"])("activates a planned project when a task enters %s", (status) => {
    expect(getAutomaticProjectStatus("planned", status)).toBe("active");
  });
  it("does not activate from cancelled work or reverse any stored lifecycle state", () => {
    expect(getAutomaticProjectStatus("planned", "cancelled")).toBe("planned");
    expect(getAutomaticProjectStatus("active", "todo")).toBe("active");
    expect(getAutomaticProjectStatus("paused", "completed")).toBe("paused");
    expect(getAutomaticProjectStatus("completed", "in_progress")).toBe("completed");
  });
  it("restores a planned lifecycle display when an optimistic task move fails", () => {
    const previousProjectStatus = "planned";
    const optimisticProjectStatus = getAutomaticProjectStatus(previousProjectStatus, "in_progress");
    expect(optimisticProjectStatus).toBe("active");
    expect(previousProjectStatus).toBe("planned");
  });
});

describe("manual lifecycle transitions", () => {
  const todo = [{ status: "todo" }];
  const progressed = [{ status: "in_progress" }];
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
  it("makes completed project metadata read-only", () => {
    expect(canUpdateProjectMetadata("completed")).toBe(false);
    expect(canUpdateProjectMetadata("active")).toBe(true);
  });
  it("rejects lifecycle status in the normal project-edit validator", () => {
    expect(editProjectSchema.safeParse({ name: "Project", project_code: "", client_name: "", description: "", total_area_m2: 10, priority: "normal", start_date: "2026-07-28", due_date: "", status: "active" }).success).toBe(false);
  });
});
