import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(resolve(process.cwd(), "src/components/administration/administration-workspace.tsx"), "utf8");

describe("Administration workspace presentation", () => {
  it("puts the pending action queue before its quieter supporting sections and keeps its count prominent", () => {
    expect(workspace.indexOf('id="requests"')).toBeLessThan(workspace.indexOf('id="upcoming"'));
    expect(workspace).toContain("{data.pendingRequests.length} pending");
  });

  it("renders every required pending-row field and one action group", () => {
    expect(workspace).toContain("request.employeeName");
    expect(workspace).toContain("labels[request.requestType]");
    expect(workspace).toContain("formatAdministrationDateRange(request)");
    expect(workspace).toContain('>Reason<');
    expect(workspace).toContain("statusStyle.label");
    expect(workspace).toContain(">View details<");
    expect(workspace).toContain('"Approve"');
    expect(workspace).toContain(">Reject<");
    expect(workspace.match(/>View details</g)).toHaveLength(1);
    const pendingRow = workspace.slice(workspace.indexOf("function PendingRequestRow"), workspace.indexOf("function AvailabilityRow"));
    expect(pendingRow.match(/"Approve"/g)).toHaveLength(1);
    expect(pendingRow.match(/>Reject</g)).toHaveLength(1);
  });

  it("keeps an empty pending queue compact while rendering the supporting sections", () => {
    expect(workspace).toContain('title="No time-off requests require action."');
    expect(workspace).toContain("Upcoming availability");
    expect(workspace).toContain("Recent decisions");
  });

  it("uses shared semantic badges for decisions while keeping reviewer attribution separate", () => {
    const decisionRow = workspace.slice(workspace.indexOf("function DecisionRow"), workspace.indexOf("function RequestDrawer"));
    expect(decisionRow).toContain("getTimeOffStatusBadgeStyle(request.status)");
    expect(decisionRow).toContain("statusStyle.label");
    expect(decisionRow).toContain("Reviewed by");
    expect(decisionRow).toContain("request.reviewerName");
    expect(decisionRow).not.toContain("Outcome:");
  });

  it("keeps current availability distinct with the shared approved-status marker", () => {
    const availabilityRow = workspace.slice(workspace.indexOf("function AvailabilityRow"), workspace.indexOf("function DecisionRow"));
    expect(availabilityRow).toContain("getTimeOffStatusBadgeStyle(request.status)");
    expect(workspace).toContain("border-emerald-100");
  });
});
