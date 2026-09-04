import { describe, expect, it } from "vitest";
import { getAllowedOfficeAssignmentStatuses, isOfficeAssignmentOverdue, isTerminalOfficeAssignmentStatus } from "./office-assignments";

describe("office assignment workflow", () => {
  it("enforces the normal assigned to in-progress to done sequence", () => {
    expect(getAllowedOfficeAssignmentStatuses("assigned", false)).toEqual(["in_progress"]);
    expect(getAllowedOfficeAssignmentStatuses("in_progress", false)).toEqual(["done"]);
    expect(getAllowedOfficeAssignmentStatuses("done", false)).toEqual([]);
  });

  it("reserves cancellation for administrators and keeps terminals closed", () => {
    expect(getAllowedOfficeAssignmentStatuses("assigned", true)).toEqual(["in_progress", "cancelled"]);
    expect(getAllowedOfficeAssignmentStatuses("cancelled", true)).toEqual([]);
    expect(isTerminalOfficeAssignmentStatus("cancelled")).toBe(true);
  });

  it("marks only active past-deadline assignments overdue", () => {
    expect(isOfficeAssignmentOverdue("2026-09-03", "assigned", "2026-09-04")).toBe(true);
    expect(isOfficeAssignmentOverdue("2026-09-03", "done", "2026-09-04")).toBe(false);
    expect(isOfficeAssignmentOverdue(null, "assigned", "2026-09-04")).toBe(false);
  });
});
