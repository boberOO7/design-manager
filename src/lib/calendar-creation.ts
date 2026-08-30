import type { CalendarEventType, TimeOffRequestType } from "@/types/calendar";

export type CalendarCreatorRole = "admin" | "employee";

export const EMPLOYEE_CALENDAR_EVENT_TYPES = ["general", "meeting", "presentation", "site_visit", "business_trip", "work_makeup"] as const satisfies readonly CalendarEventType[];
export const ADMIN_CALENDAR_EVENT_TYPES = ["general", "meeting", "presentation", "interview", "site_visit", "business_trip"] as const satisfies readonly CalendarEventType[];
export const EMPLOYEE_TIME_OFF_REQUEST_TYPES = ["vacation", "day_off", "sick_leave"] as const satisfies readonly TimeOffRequestType[];
export const ADMIN_TIME_OFF_REQUEST_TYPES = ["sick_leave", "vacation"] as const satisfies readonly TimeOffRequestType[];

export function getCreatableCalendarEventTypes(role: CalendarCreatorRole): readonly CalendarEventType[] {
  return role === "admin" ? ADMIN_CALENDAR_EVENT_TYPES : EMPLOYEE_CALENDAR_EVENT_TYPES;
}

export function getCreatableTimeOffRequestTypes(role: CalendarCreatorRole): readonly TimeOffRequestType[] {
  return role === "admin" ? ADMIN_TIME_OFF_REQUEST_TYPES : EMPLOYEE_TIME_OFF_REQUEST_TYPES;
}

export function canCreateCalendarEventType(role: CalendarCreatorRole, type: CalendarEventType): boolean {
  return getCreatableCalendarEventTypes(role).includes(type);
}

export function canCreateTimeOffRequestType(role: CalendarCreatorRole, type: TimeOffRequestType): boolean {
  return getCreatableTimeOffRequestTypes(role).includes(type);
}
