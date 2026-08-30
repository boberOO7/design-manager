import { CalendarDays, MapPin, Plane, Presentation, UserRoundSearch, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CalendarEventType } from "@/types/calendar";

type CalendarEventTypeConfig = {
  labelKey: "event" | "meeting" | "interview" | "siteVisit" | "businessTrip" | "presentation" | "internalReview" | "workMakeup";
  tone: string;
  Icon: LucideIcon;
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

export function getCalendarEventTypeConfig(eventType: CalendarEventType): CalendarEventTypeConfig {
  return CALENDAR_EVENT_TYPE_CONFIG[eventType];
}
