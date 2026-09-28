import { describe, expect, it } from "vitest";
import { getActiveTaskDeadline, getTaskDeadlinePresentation, isTaskDeadlineOverdue, TASK_MILESTONE_STATUSES, toTaskDeadlineInputs } from "./task-deadlines";

const deadlines = [
  { id: "internal", target_status: "internal_review" as const, due_date: "2026-09-10" },
  { id: "client", target_status: "review" as const, due_date: "2026-09-14" },
  { id: "done", target_status: "completed" as const, due_date: "2026-09-18" },
];

describe("task milestone deadlines", () => {
  it("offers only post-progress workflow points as new deadline targets", () => {
    expect(TASK_MILESTONE_STATUSES).toEqual(["internal_review", "review", "completed"]);
  });

  it("advances the active deadline once the workflow point has been reached", () => {
    expect(getActiveTaskDeadline({ status: "in_progress", deadlines })?.id).toBe("internal");
    expect(getActiveTaskDeadline({ status: "internal_review", deadlines })?.id).toBe("client");
    expect(getActiveTaskDeadline({ status: "review", deadlines })?.id).toBe("done");
    expect(getActiveTaskDeadline({ status: "completed", deadlines })).toBeNull();
  });

  it("only treats an unreached milestone as overdue", () => {
    expect(isTaskDeadlineOverdue({ status: "in_progress", deadlines }, "2026-09-11")).toBe(true);
    expect(isTaskDeadlineOverdue({ status: "internal_review", deadlines }, "2026-09-11")).toBe(false);
  });

  it("keeps paused and blocked unfinished schedules out of normal overdue state", () => {
    const scheduleDeadline = [deadlines[2]!];
    for (const [state, schedule] of [
      ["blocked", { is_blocked: true, is_paused: false }],
      ["paused", { is_blocked: false, is_paused: true }],
    ] as const) {
      const task = { status: "todo", deadlines: scheduleDeadline, schedule };
      expect(isTaskDeadlineOverdue(task, "2026-09-30")).toBe(false);
      expect(getTaskDeadlinePresentation(task, "2026-09-30")[0]?.state).toBe(state);
    }
  });

  it("does not make a recorded review handoff overdue when work is reopened", () => {
    const reached = { ...deadlines[0]!, completion: { due_date: "2026-09-10", completed_on: "2026-09-12", completed_at: "2026-09-12T08:00:00Z" } };
    const task = { status: "in_progress", deadlines: [reached], schedule: { is_blocked: false, is_paused: false } };
    expect(getActiveTaskDeadline(task)).toBeNull();
    expect(isTaskDeadlineOverdue(task, "2026-09-30")).toBe(false);
    expect(getTaskDeadlinePresentation(task, "2026-09-30")[0]?.state).toBe("completed_late");
  });

  it("does not claim on-time delivery when a scheduled task skips internal review", () => {
    const task = { status: "review", deadlines: [deadlines[0]!], schedule: { is_blocked: false, is_paused: false } };
    expect(getTaskDeadlinePresentation(task, "2026-09-30")[0]?.state).toBe("unrecorded");
  });

  it("serializes only the deadline fields accepted by the task-details RPC", () => {
    expect(toTaskDeadlineInputs([{ ...deadlines[0]!, created_at: "2026-09-01T00:00:00Z" }])).toEqual([
      { target_status: "internal_review", due_date: "2026-09-10" },
    ]);
  });

  it("safely ignores a legacy In progress deadline for editing and compact surfaces", () => {
    const legacyDeadline = { id: "legacy", target_status: "in_progress" as const, due_date: "2026-09-01" };

    expect(toTaskDeadlineInputs([legacyDeadline])).toEqual([]);
    expect(getActiveTaskDeadline({ status: "todo", deadlines: [legacyDeadline] })).toBeNull();
  });

  it("keeps all known milestones in workflow order with their reached, overdue, and upcoming states", () => {
    expect(getTaskDeadlinePresentation({ status: "internal_review", deadlines }, "2026-09-11")).toEqual([
      { deadline: deadlines[0], state: "completed_on_time" },
      { deadline: deadlines[1], state: "upcoming" },
      { deadline: deadlines[2], state: "upcoming" },
    ]);
    expect(getTaskDeadlinePresentation({ status: "in_progress", deadlines }, "2026-09-11")[0]?.state).toBe("overdue");
  });

  it("preserves a late completion separately from an active overdue deadline", () => {
    const late = { ...deadlines[2]!, completion: { due_date: "2026-09-18", completed_on: "2026-09-19", completed_at: "2026-09-19T08:00:00Z" } };
    const onTime = { ...deadlines[2]!, completion: { due_date: "2026-09-18", completed_on: "2026-09-18", completed_at: "2026-09-18T08:00:00Z" } };
    expect(getTaskDeadlinePresentation({ status: "completed", deadlines: [late] }, "2026-09-20")[0]?.state).toBe("completed_late");
    expect(getTaskDeadlinePresentation({ status: "completed", deadlines: [onTime] }, "2026-09-20")[0]?.state).toBe("completed_on_time");
  });
});
