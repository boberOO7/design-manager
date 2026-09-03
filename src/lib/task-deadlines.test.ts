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
      { deadline: deadlines[0], state: "completed" },
      { deadline: deadlines[1], state: "upcoming" },
      { deadline: deadlines[2], state: "upcoming" },
    ]);
    expect(getTaskDeadlinePresentation({ status: "in_progress", deadlines }, "2026-09-11")[0]?.state).toBe("overdue");
  });
});
