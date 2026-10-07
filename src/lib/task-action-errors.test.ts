import { describe, expect, it } from "vitest";
import { createTaskActionError, getTaskActionErrorCode } from "./task-action-errors";
import uk from "../../messages/uk.json";
import en from "../../messages/en.json";

describe("task board action failures", () => {
  it.each([
    ["Approve or send back the active review from task details", "reviewActive"],
    ["Submit and approve this task review before moving to a later status", "reviewRequired"],
    ["Resolve the active review before changing reviewers", "reviewSettingsLocked"],
    ["Complete every checklist item before moving this task to Internal Review or a later status", "checklistIncomplete"],
    ["Complete every checklist item before moving this batch to Done", "checklistIncomplete"],
    ["Choose a status enabled for this task stage.", "statusDisabled"],
    ["Task assignee must be an active project member", "assigneeUnavailable"],
    ["Choose active reviewers with access to this project", "reviewerUnavailable"],
    ["Every selected task must still be available in this project stage", "selectionChanged"],
    ["Scheduled internal review deadline must remain feasible and preserve reached history", "scheduleDeadline"],
  ])("preserves the API reason %s through the board's failure path", (message, code) => {
    const error = createTaskActionError({ success: false, formError: message }, 400);
    expect(getTaskActionErrorCode(error)).toBe(code);
  });

  it("explains a blocked review move in both supported languages", () => {
    const code = getTaskActionErrorCode({ formError: "Approve or send back the active review from task details" });
    if (!code) throw new Error("Missing review error code");
    expect(uk.Tasks.actionErrors[code]).toContain("схваліть її або поверніть на доопрацювання");
    expect(en.Tasks.actionErrors[code]).toContain("Approve it or send it back for rework");
  });

  it("keeps a saved-but-unrefreshed mutation distinct from a rejected mutation", () => {
    const error = createTaskActionError({ formError: "The task status was updated, but the project could not be refreshed. Please refresh the page." }, 400);
    expect(getTaskActionErrorCode(error)).toBe("savedRefreshFailed");
  });

  it("distinguishes connection, access and server failures", () => {
    expect(getTaskActionErrorCode(new TypeError("Failed to fetch"))).toBe("network");
    expect(getTaskActionErrorCode(null, 401)).toBe("sessionExpired");
    expect(getTaskActionErrorCode(null, 403)).toBe("permissionDenied");
    expect(getTaskActionErrorCode(null, 429)).toBe("rateLimited");
    expect(getTaskActionErrorCode(null, 503)).toBe("serverUnavailable");
  });

  it("uses the action fallback for unknown or malformed errors and keeps raw database text out of the toast", () => {
    for (const payload of [null, {}, { formError: { detail: "invalid" } }, { formError: "violates private constraint task_secret_check" }]) {
      const error = createTaskActionError(payload, 400);
      expect(getTaskActionErrorCode(error)).toBeNull();
      expect(error.message).not.toContain("task_secret_check");
    }
  });
});
