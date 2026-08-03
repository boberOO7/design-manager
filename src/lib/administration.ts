import { addCalendarDays, parseDateOnly } from "@/lib/calendar";
import type { TimeOffRequestType, TimeOffStatus } from "@/types/calendar";
import { timeOffRequestTypeKey } from "@/lib/time-off-labels";
import type { SystemRole } from "@/types";
import type { StudioChecklistTemplate } from "@/lib/studio-checklist-templates";


export type AdministrationRequest = {
  id: string;
  employeeName: string;
  employeeRole: string | null;
  requestType: TimeOffRequestType;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  privateNote: string | null;
  reviewNote: string | null;
  status: TimeOffStatus;
  createdAt: string;
  reviewedAt: string | null;
  cancelledAt: string | null;
  reviewerName: string | null;
};

export type AdministrationModel = {
  checklistTemplates: StudioChecklistTemplate[];
  studioId: string;
  today: string;
  upcomingEnd: string;
  pendingRequests: AdministrationRequest[];
  upcomingAbsences: AdministrationRequest[];
  recentDecisions: AdministrationRequest[];
  team: { activeMembers: number; administrators: number; inactiveMembers: number };
};

export function getTimeOffRequestTypeLabel(requestType: TimeOffRequestType): (typeof timeOffRequestTypeKey)[TimeOffRequestType] {
  return timeOffRequestTypeKey[requestType];
}

export function canReceiveAdministrationModel(role: SystemRole): boolean {
  return role === "admin";
}

export function getUpcomingEndDate(today: string): string {
  return addCalendarDays(today, 29);
}

export function isUpcomingAbsence(request: AdministrationRequest, start: string, end: string): boolean {
  return request.status === "approved" && request.cancelledAt === null && request.startDate <= end && request.endDate >= start;
}

export function sortPendingRequests(requests: AdministrationRequest[]): AdministrationRequest[] {
  return [...requests].filter((request) => request.status === "pending").sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.startDate.localeCompare(right.startDate) || left.employeeName.localeCompare(right.employeeName) || left.id.localeCompare(right.id));
}

export function sortUpcomingAbsences(requests: AdministrationRequest[]): AdministrationRequest[] {
  return [...requests].sort((left, right) => left.startDate.localeCompare(right.startDate) || (left.startTime ?? "00:00").localeCompare(right.startTime ?? "00:00") || left.id.localeCompare(right.id));
}

function effectiveDecisionTime(request: AdministrationRequest): string {
  return request.status === "cancelled" ? request.cancelledAt ?? "" : request.reviewedAt ?? "";
}

export function sortRecentDecisions(requests: AdministrationRequest[]): AdministrationRequest[] {
  return [...requests].filter((request) => (request.status === "approved" || request.status === "rejected" || request.status === "cancelled") && Boolean(effectiveDecisionTime(request))).sort((left, right) =>
    effectiveDecisionTime(right).localeCompare(effectiveDecisionTime(left)) || right.id.localeCompare(left.id));
}

export function applyAdministrationDecision(model: AdministrationModel, request: AdministrationRequest): AdministrationModel {
  const withoutRequest = (items: AdministrationRequest[]) => items.filter((item) => item.id !== request.id);
  const pendingRequests = sortPendingRequests(withoutRequest(model.pendingRequests));
  const recentDecisions = sortRecentDecisions([...withoutRequest(model.recentDecisions), request]).slice(0, 10);
  const upcomingAbsences = isUpcomingAbsence(request, model.today, model.upcomingEnd)
    ? sortUpcomingAbsences([...withoutRequest(model.upcomingAbsences), request])
    : sortUpcomingAbsences(withoutRequest(model.upcomingAbsences));
  return { ...model, pendingRequests, recentDecisions, upcomingAbsences };
}

export function formatAdministrationDateRange(request: Pick<AdministrationRequest, "startDate" | "endDate" | "startTime" | "endTime" | "allDay">, locale = "en"): string {
  const date = (value: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(parseDateOnly(value));
  const range = request.startDate === request.endDate ? date(request.startDate) : `${date(request.startDate)} – ${date(request.endDate)}`;
  return request.allDay ? range : `${range} · ${request.startTime}–${request.endTime}`;
}
