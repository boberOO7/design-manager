export const SUBMISSION_TYPES = ["request", "suggestion", "complaint"] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

export const SUBMISSION_STATUSES = [
  "new", "accepted", "in_progress", "done", "rejected", "discussion",
  "planned", "implemented", "reviewing", "action_taken", "closed",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_WORKFLOWS = {
  request: ["new", "accepted", "in_progress", "done"],
  suggestion: ["new", "discussion", "accepted", "planned", "implemented"],
  complaint: ["new", "reviewing", "action_taken", "closed"],
} as const satisfies Record<SubmissionType, readonly SubmissionStatus[]>;

export const SUBMISSION_TERMINAL_STATUSES = {
  request: ["done", "rejected"],
  suggestion: ["implemented", "rejected"],
  complaint: ["closed"],
} as const satisfies Record<SubmissionType, readonly SubmissionStatus[]>;

export const SUBMISSION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SubmissionPriority = (typeof SUBMISSION_PRIORITIES)[number];

export function isSubmissionType(value: unknown): value is SubmissionType {
  return typeof value === "string" && SUBMISSION_TYPES.includes(value as SubmissionType);
}

export function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return typeof value === "string" && SUBMISSION_STATUSES.includes(value as SubmissionStatus);
}

export function getAllowedNextStatuses(type: SubmissionType, status: SubmissionStatus): SubmissionStatus[] {
  const workflow = SUBMISSION_WORKFLOWS[type];
  const index = workflow.findIndex((item) => item === status);
  if (index < 0 || index === workflow.length - 1) return [];
  const next: SubmissionStatus[] = [workflow[index + 1]];
  if (type !== "complaint") next.push("rejected");
  return next;
}

export function isTerminalSubmissionStatus(type: SubmissionType, status: SubmissionStatus): boolean {
  return (SUBMISSION_TERMINAL_STATUSES[type] as readonly SubmissionStatus[]).includes(status);
}
