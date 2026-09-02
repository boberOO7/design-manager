import { describe, expect, it } from "vitest";
import { getActiveTaskDeadline, isTaskDeadlineOverdue, toTaskDeadlineInputs } from "./task-deadlines";

const deadlines = [
  { id: "internal", target_status: "internal_review" as const, due_date: "2026-09-10" },
  { id: "client", target_status: "review" as const, due_date: "2026-09-14" },
  { id: "done", target_status: "completed" as const, due_date: "2026-09-18" },
];

describe("task milestone deadlines", () => {
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
});
