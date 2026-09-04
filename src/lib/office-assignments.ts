export const OFFICE_ASSIGNMENT_STATUSES = ["assigned", "in_progress", "done", "cancelled"] as const;
export type OfficeAssignmentStatus = (typeof OFFICE_ASSIGNMENT_STATUSES)[number];

export const OFFICE_ASSIGNMENT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type OfficeAssignmentPriority = (typeof OFFICE_ASSIGNMENT_PRIORITIES)[number];

export const OFFICE_ASSIGNMENT_WORKFLOW = ["assigned", "in_progress", "done"] as const;
export const OFFICE_ASSIGNMENT_TERMINAL_STATUSES = ["done", "cancelled"] as const;

export function getAllowedOfficeAssignmentStatuses(status: OfficeAssignmentStatus, isAdmin: boolean): OfficeAssignmentStatus[] {
  if (OFFICE_ASSIGNMENT_TERMINAL_STATUSES.includes(status as "done" | "cancelled")) return [];
  const index = OFFICE_ASSIGNMENT_WORKFLOW.findIndex((value) => value === status);
  const next = index >= 0 && index < OFFICE_ASSIGNMENT_WORKFLOW.length - 1 ? [OFFICE_ASSIGNMENT_WORKFLOW[index + 1]] : [];
  return isAdmin ? [...next, "cancelled"] : next;
}

export function isTerminalOfficeAssignmentStatus(status: OfficeAssignmentStatus): boolean {
  return OFFICE_ASSIGNMENT_TERMINAL_STATUSES.includes(status as "done" | "cancelled");
}

export function isOfficeAssignmentOverdue(deadline: string | null, status: OfficeAssignmentStatus, today: string): boolean {
  return Boolean(deadline && deadline < today && !isTerminalOfficeAssignmentStatus(status));
}
