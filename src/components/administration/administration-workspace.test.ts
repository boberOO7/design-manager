import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(resolve(process.cwd(), "src/components/administration/administration-workspace.tsx"), "utf8");

describe("Administration workspace presentation", () => {
  it("puts the pending action queue before its quieter supporting sections and keeps its count prominent", () => {
    expect(workspace.indexOf('id="requests"')).toBeLessThan(workspace.indexOf('id="upcoming"'));
    expect(workspace).toContain('calendar("pending", { count: data.pendingRequests.length })');
  });

  it("renders every required pending-row field and one action group", () => {
    expect(workspace).toContain("request.employeeName");
    expect(workspace).toContain("timeOff(typeKey(request.requestType))");
    expect(workspace).toContain("formatAdministrationDateRange(request, locale)");
    expect(workspace).toContain('administration("reason")');
    expect(workspace).toContain("statusStyle.label");
    expect(workspace).toContain('timeOff("viewDetails")');
    expect(workspace).toContain('timeOff("approve")');
    expect(workspace).toContain('timeOff("reject")');
    const pendingRow = workspace.slice(workspace.indexOf("function PendingRequestRow"), workspace.indexOf("function AvailabilityRow"));
    expect(pendingRow.match(/timeOff\("approve"\)/g)).toHaveLength(1);
    expect(pendingRow.match(/timeOff\("reject"\)/g)).toHaveLength(1);
  });

  it("keeps an empty pending queue compact while rendering the supporting sections", () => {
    expect(workspace).toContain('title={t("noRequests")}');
    expect(workspace).toContain('availability("upcoming")');
    expect(workspace).toContain('t("recentDecisions")');
    expect(workspace).toContain("ChecklistTemplateManager");
  });

  it("bounds recent history on larger screens without forcing a nested mobile scroll", () => {
    expect(workspace).toContain('md:max-h-72 md:overflow-y-auto');
    expect(workspace).toContain('aria-label={t("recentHistory")}');
  });

  it("uses shared semantic badges for decisions while keeping reviewer attribution separate", () => {
    const decisionRow = workspace.slice(workspace.indexOf("function DecisionRow"), workspace.indexOf("function RequestDrawer"));
    expect(decisionRow).toContain("getTimeOffStatusBadgeStyle(request.status)");
    expect(decisionRow).toContain("statusStyle.label");
    expect(decisionRow).toContain('administration("reviewedBy"');
    expect(decisionRow).toContain("request.reviewerName");
    expect(decisionRow).not.toContain("Outcome:");
  });

  it("keeps current availability distinct with the shared approved-status marker", () => {
    const availabilityRow = workspace.slice(workspace.indexOf("function AvailabilityRow"), workspace.indexOf("function DecisionRow"));
    expect(availabilityRow).toContain("getTimeOffStatusBadgeStyle(request.status)");
    expect(workspace).toContain("border-[var(--ui-success-border)]");
  });
});
