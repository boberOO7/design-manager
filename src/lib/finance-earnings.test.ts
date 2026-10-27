import { describe, expect, it } from "vitest";
import { earningCoverageIssues, earningsReportSchema, fulfillEarningMilestoneSchema, saveEarningMilestoneSchema } from "./finance-earnings";
const id = "87000000-0000-4000-8000-000000000001";
const order = { orderId: id, projectId: id, currency: "UAH", contract: "1000", configured: false, complete: false, stale: false, earned: "0", unearned: "1000", hasRecognition: false };

describe("Contractual earning configuration and coverage", () => {
  it("requires an explicit actual event/date and confirmation rather than payment metadata", () => {
    const input = { requestId: id, milestoneId: id, intent: "fulfill", revision: 1, kind: "delivery", confirmed: "true" };
    expect(fulfillEarningMilestoneSchema.safeParse({ ...input, expectedDate: "2026-10-18", dueDate: "2026-10-18" }).success).toBe(false);
    expect(fulfillEarningMilestoneSchema.safeParse({ ...input, date: "2026-10-18", confirmed: "false" }).success).toBe(false);
    expect(fulfillEarningMilestoneSchema.safeParse({ ...input, date: "2026-10-18" }).success).toBe(true);
    expect(fulfillEarningMilestoneSchema.parse({ requestId: id, milestoneId: id, intent: "retry" }).date).toBe("");
  });
  it("requires one explicit net amount or share and defaults to client delivery", () => {
    const input = { requestId: id, projectId: id, orderId: id, revision: 0, title: "Contractual drawings" };
    expect(saveEarningMilestoneSchema.safeParse(input).success).toBe(false);
    expect(saveEarningMilestoneSchema.safeParse({ ...input, percentage: "50", netAmount: "500" }).success).toBe(false);
    expect(saveEarningMilestoneSchema.parse({ ...input, percentage: "50" }).condition).toBe("delivery");
    expect(saveEarningMilestoneSchema.parse({ ...input, netAmount: "500,25" }).netAmount).toBe("500.25");
    expect(saveEarningMilestoneSchema.parse({ ...input, netAmount: "500.00", condition: "acceptance", stage: "stage_3" }).condition).toBe("acceptance");
  });
  it("marks unconfigured or partially configured orders incomplete instead of confirming zero earnings", () => {
    expect(earningCoverageIssues(earningsReportSchema.parse({ milestones: [], orders: [order] }))).toHaveLength(1);
    expect(earningCoverageIssues(earningsReportSchema.parse({ milestones: [], orders: [{ ...order, configured: true }] }))).toHaveLength(1);
    expect(earningCoverageIssues(earningsReportSchema.parse({ milestones: [], orders: [{ ...order, configured: true, complete: true }] }))).toHaveLength(0);
    expect(earningCoverageIssues(earningsReportSchema.parse({ milestones: [], orders: [{ ...order, configured: true, complete: true, stale: true }] }))).toHaveLength(1);
    expect(earningCoverageIssues(earningsReportSchema.parse({ milestones: [], orders: [order] }), "87000000-0000-4000-8000-000000000002")).toHaveLength(0);
  });
});
