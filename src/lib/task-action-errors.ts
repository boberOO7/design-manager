const errorGroups = [
  { code: "reviewActive", messages: ["Approve or send back the active review from task details"] },
  { code: "reviewRequired", messages: ["Submit and approve this task review before moving to a later status"] },
  { code: "reviewSettingsLocked", messages: ["Resolve the active review before changing review settings or task stage", "Resolve the active review before changing reviewers"] },
  { code: "reviewWorkflow", messages: ["Review requires In progress, Internal review, and a later workflow status", "Enable a workflow status after Internal review"] },
  { code: "reviewSubmission", messages: ["Enable review while the task is To do or In progress", "Submit a review from In progress"] },
  { code: "reviewerUnavailable", messages: ["Choose active reviewers with access to this project", "Choose an active reviewer with access to this project"] },
  { code: "checklistIncomplete", messages: ["Complete every checklist item before moving this task to done", "Complete every checklist item before moving this batch to Done", "Complete every checklist item before moving this task to Internal Review or a later status", "Complete every checklist item before moving this task to Internal Review or Done", "Complete every checklist item before moving this task to client review or done"] },
  { code: "assigneeRequired", messages: ["Assign productivity-bearing work to an active project member before marking it complete", "Assign productivity-bearing work to an active project member before marking it complete.", "Productivity-bearing work must be assigned to an active project member before marking this batch complete"] },
  { code: "assigneeUnavailable", messages: ["Task assignee must be an active project member"] },
  { code: "statusDisabled", messages: ["Choose a status enabled for this task stage", "Choose a status enabled for this task stage."] },
  { code: "selectionChanged", messages: ["Every selected task must still be available in this project stage", "Every selected task must still be in this project stage.", "Every task in the batch must still be available in the source column"] },
  { code: "readOnly", messages: ["This project stage is read-only", "This project task is read-only", "Completed production tasks and archived project tasks are read-only.", "Archived project tasks are read-only", "This project stage is read-only or unavailable."] },
  { code: "permissionDenied", messages: ["You can update only tasks assigned to you.", "Only active studio administrators can assign project tasks", "Only active studio administrators can edit task deadlines", "Only active studio administrators can edit task details.", "Only active studio administrators can configure task review", "Only active studio administrators can configure task review.", "Only active studio administrators can pause stage schedules"] },
  { code: "sessionExpired", messages: ["An active studio membership is required", "An active studio membership is required."] },
  { code: "taskUnavailable", messages: ["The task was not found or is not available.", "Task not found or unavailable"] },
  { code: "scheduleDeadline", messages: ["Scheduled internal review deadline must remain feasible and preserve reached history", "Milestone deadline cannot precede scheduled work", "Scheduled tasks require an internal review deadline", "Scheduled deadlines must be working days", "Reached task schedule history cannot move", "Deadline is earlier than this task can finish"] },
  { code: "savedRefreshFailed", messages: ["The task status was updated, but the project could not be refreshed. Please refresh the page.", "The task status was updated, but the task could not be refreshed. Please refresh the page.", "The task batch was moved, but the project could not be refreshed. Please refresh the page."] },
  { code: "network", messages: ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"] },
  { code: "serverUnavailable", messages: [] },
  { code: "rateLimited", messages: [] },
] as const;

export type TaskActionErrorCode = typeof errorGroups[number]["code"];

class TaskActionError extends Error {
  constructor(readonly code: TaskActionErrorCode | null, cause: unknown) {
    super("Task action failed", { cause });
  }
}

export function getTaskActionErrorCode(failure: unknown, status?: number): TaskActionErrorCode | null {
  if (failure instanceof TaskActionError) return failure.code;
  const message = failure instanceof Error ? failure.message : typeof failure === "string" ? failure
    : typeof failure === "object" && failure !== null && "formError" in failure && typeof failure.formError === "string" ? failure.formError
    : typeof failure === "object" && failure !== null && "error" in failure && typeof failure.error === "string" ? failure.error : null;
  const known = errorGroups.find((group) => group.messages.some((candidate) => candidate === message));
  if (known) return known.code;
  if (status === 401) return "sessionExpired";
  if (status === 403) return "permissionDenied";
  if (status === 429) return "rateLimited";
  if (status && status >= 500) return "serverUnavailable";
  return null;
}

export function createTaskActionError(response: unknown, status: number): Error {
  return new TaskActionError(getTaskActionErrorCode(response, status), response);
}
