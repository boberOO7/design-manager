import { describe, expect, it } from "vitest";
import { getBoardTaskProgressSummary } from "./task-card-presentation";

describe("Board task-card progress presentation", () => {
  it("shows compact checklist production only for in-progress tasks", () => {
    expect(getBoardTaskProgressSummary({
      status: "in_progress",
      production_completion: 90,
      checklist_items: [
        { id: "done", is_completed: true, weight: 3 },
        { id: "open", is_completed: false, weight: 2 },
      ],
    })).toEqual({ kind: "checklist", completed: 1, total: 2, percent: 60 });
  });

  it("shows compact manual production for in-progress tasks without a checklist", () => {
    expect(getBoardTaskProgressSummary({
      status: "in_progress",
      production_completion: 60,
      checklist_items: [],
    })).toEqual({ kind: "manual", percent: 60 });
  });

  it.each(["todo", "review", "completed", "cancelled"])("omits predictable progress for %s tasks", (status) => {
    expect(getBoardTaskProgressSummary({
      status,
      production_completion: 100,
      checklist_items: [{ id: "done", is_completed: true, weight: 1 }],
    })).toBeNull();
  });
});
