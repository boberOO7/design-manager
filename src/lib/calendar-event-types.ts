import { CalendarDays, MapPin, Plane, Presentation, UserRoundSearch, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CalendarEventType } from "@/types/calendar";

type CalendarEventTypeConfig = {
  labelKey: "event" | "meeting" | "interview" | "siteVisit" | "businessTrip" | "presentation" | "internalReview" | "workMakeup";
  tone: string;
  Icon: LucideIcon;
};

export type CalendarEventDetailSection =
  | "project"
  | "organizer"
  | "invitations"
  | "assignee"
  | "participants"
  | "destination"
  | "meetingMode"
  | "location"
  | "meetingUrl"
  | "recurrence"
  | "linkedDayOff";

export type CalendarEventDetailConfig = {
  sections: readonly CalendarEventDetailSection[];
  invitationLabel?: "invitees" | "participants";
};

export const CALENDAR_EVENT_TYPE_CONFIG: Record<CalendarEventType, CalendarEventTypeConfig> = {
  general: { labelKey: "event", tone: "border-l-[var(--ui-calendar-general-border)] bg-[var(--ui-calendar-general-surface)] text-[var(--ui-calendar-general-text)]", Icon: CalendarDays },
  meeting: { labelKey: "meeting", tone: "border-l-[var(--ui-calendar-meeting-border)] bg-[var(--ui-calendar-meeting-surface)] text-[var(--ui-calendar-meeting-text)]", Icon: Users },
  interview: { labelKey: "interview", tone: "border-l-[var(--ui-calendar-interview-border)] bg-[var(--ui-calendar-interview-surface)] text-[var(--ui-calendar-interview-text)]", Icon: UserRoundSearch },
  site_visit: { labelKey: "siteVisit", tone: "border-l-[var(--ui-calendar-site-visit-border)] bg-[var(--ui-calendar-site-visit-surface)] text-[var(--ui-calendar-site-visit-text)]", Icon: MapPin },
  business_trip: { labelKey: "businessTrip", tone: "border-l-[var(--ui-calendar-business-trip-border)] bg-[var(--ui-calendar-business-trip-surface)] text-[var(--ui-calendar-business-trip-text)]", Icon: Plane },
  presentation: { labelKey: "presentation", tone: "border-l-[var(--ui-calendar-presentation-border)] bg-[var(--ui-calendar-presentation-surface)] text-[var(--ui-calendar-presentation-text)]", Icon: Presentation },
  internal_review: { labelKey: "internalReview", tone: "border-l-[var(--ui-calendar-general-border)] bg-[var(--ui-calendar-general-surface)] text-[var(--ui-calendar-general-text)]", Icon: CalendarDays },
  work_makeup: { labelKey: "workMakeup", tone: "border-l-[var(--ui-calendar-general-border)] bg-[var(--ui-calendar-general-surface)] text-[var(--ui-calendar-general-text)]", Icon: CalendarDays },
};

/**
 * Mirrors the fields exposed by EventForm and persisted for each event type.
 * Keep this presentation mapping beside the semantic type mapping so every
 * Calendar view reaches the same detail behavior.
 */
export const CALENDAR_EVENT_DETAIL_CONFIG: Record<CalendarEventType, CalendarEventDetailConfig> = {
  general: { sections: ["project", "organizer", "invitations", "location", "meetingUrl", "recurrence"], invitationLabel: "invitees" },
  meeting: { sections: ["project", "organizer", "invitations", "meetingMode", "location", "meetingUrl"], invitationLabel: "participants" },
  interview: { sections: ["assignee", "meetingUrl"] },
  site_visit: { sections: ["project", "assignee", "location"] },
  business_trip: { sections: ["project", "destination", "participants"] },
  presentation: { sections: ["project", "organizer", "invitations", "meetingMode", "location", "meetingUrl"], invitationLabel: "participants" },
  internal_review: { sections: ["project", "organizer", "invitations", "location", "meetingUrl", "recurrence"], invitationLabel: "invitees" },
  work_makeup: { sections: ["linkedDayOff"] },
};

export function getCalendarEventTypeConfig(eventType: CalendarEventType): CalendarEventTypeConfig {
  return CALENDAR_EVENT_TYPE_CONFIG[eventType];
}

export function getCalendarEventDetailConfig(eventType: CalendarEventType): CalendarEventDetailConfig {
  return CALENDAR_EVENT_DETAIL_CONFIG[eventType];
}
