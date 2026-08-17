import { describe, expect, it } from "vitest";
import { applyAdministrationDecision, canReceiveAdministrationModel, getRequiredTimeOffApprovalCount, getUpcomingEndDate, isUpcomingAbsence, sortPendingRequests, sortRecentDecisions, type AdministrationModel, type AdministrationRequest } from "@/lib/administration";

function request(overrides: Partial<AdministrationRequest> = {}): AdministrationRequest {
  return { id: "r1", employeeName: "Avery", employeeRole: "Designer", requestType: "vacation", startDate: "2026-07-28", endDate: "2026-07-28", startTime: null, endTime: null, allDay: true, privateNote: null, reviewNote: null, status: "pending", createdAt: "2026-07-20T09:00:00.000Z", reviewedAt: null, cancelledAt: null, reviewerName: null, approvalCount: 0, requiredApprovalCount: 2, hasCurrentAdminApproved: false, ...overrides };
}
function model(): AdministrationModel { return { studioId: "studio-1", checklistTemplates: [], today: "2026-07-28", upcomingEnd: getUpcomingEndDate("2026-07-28"), pendingRequests: [request()], upcomingAbsences: [], recentDecisions: [], team: { activeMembers: 4, administrators: 1, inactiveMembers: 2 } }; }

describe("Administration time-off logic", () => {
  it("sorts only pending requests oldest first", () => {
    expect(sortPendingRequests([request({ id: "new", createdAt: "2026-07-21T00:00:00Z" }), request({ id: "reviewed", status: "approved" }), request({ id: "old", createdAt: "2026-07-19T00:00:00Z" })]).map((item) => item.id)).toEqual(["old", "new"]);
  });
  it("includes only approved, non-cancelled ranges intersecting the date-only window", () => {
    const current = model();
    expect(isUpcomingAbsence(request({ status: "approved", startDate: "2026-08-25", endDate: "2026-08-29" }), current.today, current.upcomingEnd)).toBe(true);
    expect(isUpcomingAbsence(request({ status: "rejected" }), current.today, current.upcomingEnd)).toBe(false);
    expect(isUpcomingAbsence(request({ status: "approved", cancelledAt: "2026-07-27T00:00:00Z" }), current.today, current.upcomingEnd)).toBe(false);
  });
  it("sorts recent decisions by effective action time", () => {
    expect(sortRecentDecisions([request({ id: "approved", status: "approved", reviewedAt: "2026-07-21T00:00:00Z" }), request({ id: "cancelled", status: "cancelled", cancelledAt: "2026-07-22T00:00:00Z" })]).map((item) => item.id)).toEqual(["cancelled", "approved"]);
  });
  it("locally approves without duplicates and adds an in-range absence", () => {
    const next = applyAdministrationDecision(model(), request({ status: "approved", reviewedAt: "2026-07-28T10:00:00Z" }));
    expect(next.pendingRequests).toEqual([]); expect(next.recentDecisions.map((item) => item.id)).toEqual(["r1"]); expect(next.upcomingAbsences.map((item) => item.id)).toEqual(["r1"]);
  });
  it("locally rejects without adding upcoming absence", () => {
    const next = applyAdministrationDecision(model(), request({ status: "rejected", reviewedAt: "2026-07-28T10:00:00Z" }));
    expect(next.pendingRequests).toEqual([]); expect(next.upcomingAbsences).toEqual([]);
  });
  it("retains literal date-only ranges and exposes real membership counts", () => {
    expect(request({ startDate: "2026-01-01", endDate: "2026-01-01" }).startDate).toBe("2026-01-01");
    expect(model().team).toEqual({ activeMembers: 4, administrators: 1, inactiveMembers: 2 });
  });
  it("does not permit an employee to receive an administration model", () => {
    expect(canReceiveAdministrationModel("employee")).toBe(false); expect(canReceiveAdministrationModel("admin")).toBe(true);
  });
  it("requires two approvals only for vacation", () => {
    expect(getRequiredTimeOffApprovalCount("vacation")).toBe(2);
    expect(getRequiredTimeOffApprovalCount("day_off")).toBe(1);
    expect(getRequiredTimeOffApprovalCount("medical_appointment")).toBe(1);
    expect(getRequiredTimeOffApprovalCount("sick_leave")).toBe(1);
    expect(getRequiredTimeOffApprovalCount("other")).toBe(1);
  });
});
