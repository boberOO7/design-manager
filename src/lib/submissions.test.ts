import { describe, expect, it } from "vitest";
import { canRejectSubmission, getAllowedNextStatuses, getPrimarySubmissionStatus, isTerminalSubmissionStatus, submissionTransitionRequiresResponsible, SUBMISSION_WORKFLOWS } from "./submissions";

describe("submission workflows", () => {
  it("keeps the three canonical workflows independent from task statuses", () => {
    expect(SUBMISSION_WORKFLOWS.request).toEqual(["new", "accepted", "in_progress", "done"]);
    expect(SUBMISSION_WORKFLOWS.suggestion).toEqual(["new", "discussion", "accepted", "planned", "implemented"]);
    expect(SUBMISSION_WORKFLOWS.complaint).toEqual(["new", "reviewing", "action_taken", "closed"]);
  });

  it("offers only the primary next step while keeping rejection separate", () => {
    expect(getAllowedNextStatuses("request", "new")).toEqual(["accepted"]);
    expect(getAllowedNextStatuses("suggestion", "discussion")).toEqual(["accepted"]);
    expect(getAllowedNextStatuses("complaint", "reviewing")).toEqual(["action_taken"]);
    expect(canRejectSubmission("request", "accepted")).toBe(true);
    expect(canRejectSubmission("complaint", "reviewing")).toBe(false);
  });

  it("uses one canonical primary transition for cards and drawers", () => {
    expect(getPrimarySubmissionStatus("request", "accepted")).toBe("in_progress");
    expect(getPrimarySubmissionStatus("complaint", "new")).toBe("reviewing");
    expect(getPrimarySubmissionStatus("suggestion", "new")).toBe("accepted");
    expect(getPrimarySubmissionStatus("suggestion", "planned")).toBe("implemented");
  });

  it("requires a responsible person when request work starts", () => {
    expect(submissionTransitionRequiresResponsible("request", "in_progress")).toBe(true);
    expect(submissionTransitionRequiresResponsible("suggestion", "planned")).toBe(false);
  });

  it("recognizes terminal states", () => {
    expect(isTerminalSubmissionStatus("request", "done")).toBe(true);
    expect(isTerminalSubmissionStatus("suggestion", "rejected")).toBe(true);
    expect(isTerminalSubmissionStatus("complaint", "reviewing")).toBe(false);
  });
});
