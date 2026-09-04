import { describe, expect, it } from "vitest";
import { getAllowedNextStatuses, isTerminalSubmissionStatus, SUBMISSION_WORKFLOWS } from "./submissions";

describe("submission workflows", () => {
  it("keeps the three canonical workflows independent from task statuses", () => {
    expect(SUBMISSION_WORKFLOWS.request).toEqual(["new", "accepted", "in_progress", "done"]);
    expect(SUBMISSION_WORKFLOWS.suggestion).toEqual(["new", "discussion", "accepted", "planned", "implemented"]);
    expect(SUBMISSION_WORKFLOWS.complaint).toEqual(["new", "reviewing", "action_taken", "closed"]);
  });

  it("offers only the next step and valid rejection alternative", () => {
    expect(getAllowedNextStatuses("request", "new")).toEqual(["accepted", "rejected"]);
    expect(getAllowedNextStatuses("suggestion", "discussion")).toEqual(["accepted", "rejected"]);
    expect(getAllowedNextStatuses("complaint", "reviewing")).toEqual(["action_taken"]);
  });

  it("recognizes terminal states", () => {
    expect(isTerminalSubmissionStatus("request", "done")).toBe(true);
    expect(isTerminalSubmissionStatus("suggestion", "rejected")).toBe(true);
    expect(isTerminalSubmissionStatus("complaint", "reviewing")).toBe(false);
  });
});
