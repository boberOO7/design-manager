import { describe, expect, it } from "vitest";
import type { TaskReviewQueueItem } from "@/data/queries/task-reviews";
import { eligibleReviewSelection, toggleReviewSelection } from "./review-queue-selection";

const round = (id: string, reviewerId = "me", projectId = "project", stage: TaskReviewQueueItem["task"]["stage"] = "stage_1"): TaskReviewQueueItem => ({
  id, reviewer_id: reviewerId, reviewer: { full_name: "Reviewer" }, round_number: 1, submitted_at: "2026-10-12T10:00:00Z",
  task: { id: `task-${id}`, title: id, stage, status: "internal_review", priority: "normal", assignee: null,
    project: { id: projectId, name: projectId, status: "active", archived_at: null } },
});

describe("personal review selection", () => {
  it("toggles an exact subset and removes stale or reassigned reviews", () => {
    const rounds = [round("one"), round("two"), round("three"), round("other", "someone")];
    const first = toggleReviewSelection([], rounds[0], rounds, "me");
    const selected = toggleReviewSelection(first, rounds[2], rounds, "me");
    expect(selected).toEqual(["one", "three"]);
    expect(toggleReviewSelection(selected, rounds[0], rounds, "me")).toEqual(["three"]);
    expect(toggleReviewSelection(selected, rounds[3], rounds, "me")).toEqual(selected);
    expect(eligibleReviewSelection([...selected, "missing", "other"], [round("one", "someone"), ...rounds.slice(1)], "me").map(row => row.id)).toEqual(["three"]);
  });

  it("starts a new selection when project or stage changes, matching Board selection", () => {
    const rounds = [round("one"), round("two", "me", "another"), round("three", "me", "project", "stage_2")];
    expect(toggleReviewSelection(["one"], rounds[1], rounds, "me")).toEqual(["two"]);
    expect(toggleReviewSelection(["one"], rounds[2], rounds, "me")).toEqual(["three"]);
  });
});
