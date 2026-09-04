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

const SUBMISSION_PRIMARY_TRANSITIONS: Record<SubmissionType, Partial<Record<SubmissionStatus, SubmissionStatus>>> = {
  request: { new: "accepted", accepted: "in_progress", in_progress: "done" },
  suggestion: { new: "accepted", discussion: "accepted", accepted: "planned", planned: "implemented" },
  complaint: { new: "reviewing", reviewing: "action_taken", action_taken: "closed" },
};

export type SubmissionWorkflowAction = {
  icon: "accept" | "start" | "complete" | "review" | "action" | "plan";
  status: SubmissionStatus;
  tone: "info" | "success" | "warning" | "violet";
};

const SUBMISSION_ACTION_PRESENTATION: Partial<Record<SubmissionStatus, Omit<SubmissionWorkflowAction, "status">>> = {
  accepted: { icon: "accept", tone: "info" },
  in_progress: { icon: "start", tone: "info" },
  done: { icon: "complete", tone: "success" },
  reviewing: { icon: "review", tone: "warning" },
  action_taken: { icon: "action", tone: "success" },
  closed: { icon: "complete", tone: "success" },
  planned: { icon: "plan", tone: "violet" },
  implemented: { icon: "complete", tone: "success" },
};

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
  const next = getPrimarySubmissionStatus(type, status);
  return next ? [next] : [];
}

export function getPrimarySubmissionStatus(type: SubmissionType, status: SubmissionStatus): SubmissionStatus | null {
  return SUBMISSION_PRIMARY_TRANSITIONS[type][status] ?? null;
}

export function getPrimarySubmissionAction(type: SubmissionType, status: SubmissionStatus): SubmissionWorkflowAction | null {
  const nextStatus = getPrimarySubmissionStatus(type, status);
  const presentation = nextStatus ? SUBMISSION_ACTION_PRESENTATION[nextStatus] : null;
  return nextStatus && presentation ? { status: nextStatus, ...presentation } : null;
}

export function canRejectSubmission(type: SubmissionType, status: SubmissionStatus): boolean {
  return type !== "complaint" && !isTerminalSubmissionStatus(type, status);
}

export function submissionTransitionRequiresResponsible(type: SubmissionType, status: SubmissionStatus): boolean {
  return type === "request" && status === "in_progress";
}

export function isTerminalSubmissionStatus(type: SubmissionType, status: SubmissionStatus): boolean {
  return (SUBMISSION_TERMINAL_STATUSES[type] as readonly SubmissionStatus[]).includes(status);
}
