import { describe, expect, it } from "vitest";
import { canConfigureTaskReview } from "./task-reviews";
import { taskEditSchema } from "./validation/task";

describe("review assignment in Internal Review", () => {
  it("permits initial assignment to tasks already in Internal Review", () => {
    expect(canConfigureTaskReview({ requires_review: false, status: "internal_review" })).toBe(true);
    expect(canConfigureTaskReview({ requires_review: true, status: "internal_review" })).toBe(true);
    expect(canConfigureTaskReview({ requires_review: false, status: "review" })).toBe(false);
    expect(canConfigureTaskReview({ requires_review: false, status: "completed" })).toBe(false);
  });

  it("validates the expected round and reviewer together for atomic task edits", () => {
    const input = { title: "Task", assignee_id: null, priority: "normal", stage: "stage_1", progress_weight: 1, reviewer_ids: ["82000000-0000-4000-8000-000000000001"] };
    const context = { review_round_id: "82000000-0000-4000-8000-000000000002", review_reviewer_id: input.reviewer_ids[0] };
    expect(taskEditSchema.safeParse({ ...input, ...context }).success).toBe(true);
    expect(taskEditSchema.safeParse({ ...input, review_round_id: context.review_round_id }).success).toBe(false);
    expect(taskEditSchema.safeParse({ ...input, review_reviewer_id: context.review_reviewer_id }).success).toBe(false);
  });
});
