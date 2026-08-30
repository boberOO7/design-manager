import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

const source = readFileSync(new URL("./calendar-workspace.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const appLayout = readFileSync(new URL("../../app/(app)/layout.tsx", import.meta.url), "utf8");

describe("Calendar event form localization contract", () => {
  it("renders create and edit forms from canonical next-intl messages", () => {
    expect(source).toContain('const t = useTranslations("Calendar")');
    expect(source).toContain('item ? t("editEventTitle") : t("addEventTitle")');
    expect(source).toContain('getCreatableCalendarEventTypes');
    expect(source).toContain('t("addEvent")');
    expect(source).toContain('t("absence")');
    expect(source).toContain('t("requestTimeOff")');
    expect(source).not.toContain('function CreationForm');
    expect(source).toContain('getCalendarEventTypeConfig(type)');
    expect(source).toContain('<InviteePicker');
    expect(source).toContain('function CalendarChipIcon');
    expect(source).toContain('getCalendarEventTypeConfig(item.eventType).Icon');
    expect(source).toContain('const SYSTEM_CALENDAR_CHIP_ICONS');
    expect(source).toContain('birthday: CakeSlice');
    expect(source).toContain('team_anniversary: CalendarHeart');
    expect(source).toContain('salary_payment: Banknote');
    expect(source).toContain('studio_day_off: CalendarOff');
    expect(source).toContain('time_off: UserRoundMinus');
    expect(source).toContain('time_off_request_admin: UserRoundMinus');
    expect(source).toContain('shrink-0 stroke-[1.75]');
    expect(source).toContain('function CalendarDetailHeaderIcon');
    expect(source).toContain('<CalendarDetailHeaderIcon item={item} />');
    expect(source.indexOf('<FormField label={t("type")}')).toBeLessThan(source.indexOf('<FormField label={t("titleLabel")}'));
    expect(source).toContain('<MeetingModeControl');
    expect(source).not.toContain('<SegmentedControl ariaLabel={t("meetingMode")}');
    expect(source).toContain('role="switch"');
    expect(source).toContain('onClick={() => onValueChange(online ? "offline" : "online")}');
    expect(source).toContain('const isInterview = values.eventType === "interview"');
    expect(source).toContain('label={t("interviewer")}');
    expect(source).not.toContain('title={item ? "Edit event" : "Add event"}');
  });

  it("discards new event drafts without bypassing the edit confirmation", () => {
    expect(source).toContain('if (!item || !dirty || window.confirm(t("discardEvent"))) onClose();');
  });

  it("closes new absence-request drafts without a browser confirmation", () => {
    expect(source).toContain('function requestClose() { if (!pending) onClose(); }');
    expect(source).not.toContain('window.confirm(t("discardRequest"))');
    expect(source).toContain('action === "cancel" && !window.confirm(t("cancelRequestConfirm"))');
  });

  it("keeps English and Ukrainian event-form keys in parity", () => {
    const keys = ["eventForm", "addEventTitle", "editEventTitle", "titleLabel", "type", "project", "selectProject", "addInvitees", "invitees", "organizer", "yourResponse", "interview", "interviewer", "selectInterviewer", "businessTrip", "allDayEvent", "startDate", "endDate", "startTime", "endTime", "location", "meetingUrl", "meetingMode", "offline", "online", "descriptionLabel", "saveEvent", "saving", "eventSaveFailed", "assignToMe", "absence", "submitAbsenceRequest"] as const;
    for (const key of keys) {
      expect(en.Calendar[key]).toBeTruthy();
      expect(uk.Calendar[key]).toBeTruthy();
    }
  });

  it("keeps the invitation response label localized", () => {
    expect(en.Calendar.yourResponse).toBe("Your response");
    expect(uk.Calendar.yourResponse).toBe("Ваша відповідь");
  });
});

describe("calendar detail drawer lifecycle", () => {
  it("keeps the selected drawer mounted until the shared Drawer exit completes", () => {
    expect(source).toContain('const [isDrawerOpen, setIsDrawerOpen]');
    expect(source).toContain("function clearExitedDrawer()");
    expect(source).toContain("onExited={clearExitedDrawer}");
    expect(source).toContain("isOpen={isOpen}");
    expect(source).toContain("onExited={onExited}");
  });
});

describe("time-off form localization contract", () => {
  it("renders the real request form from canonical next-intl messages", () => {
    expect(source).toContain('const t = useTranslations("TimeOff")');
    expect(source).toContain('getCreatableTimeOffRequestTypes');
    expect(source).toContain('t(timeOffRequestTypeKey[type])');
    expect(source).toContain('calendar("requestTimeOffTitle")');
    expect(source).toContain('updateLinkedStartDate(values, startDate, endDateLinked)');
    expect(source).toContain('updateLinkedStartTime(values, startTime, endTimeLinked)');
    expect(source).toContain('setEndDateLinked(false)');
    expect(source).toContain('setEndTimeLinked(false)');
    expect(source).not.toContain('title="Request time off" eyebrow="Private request"');
  });

  it("keeps English and Ukrainian request-form keys in parity", () => {
    const keys = ["privateRequest", "requestType", "allDay", "startDate", "endDate", "startTime", "endTime", "privateNote", "visibleNote", "cancel", "submit", "submitting", "requestCreateFailed", "invalidDateRange"] as const;
    for (const key of keys) {
      expect(en.TimeOff[key]).toBeTruthy();
      expect(uk.TimeOff[key]).toBeTruthy();
    }
  });
});

describe("time-off calendar title localization", () => {
  it("derives Month, Week, Agenda, tooltip, accessibility, and detail titles at render time", () => {
    expect(source).toContain("getCalendarItemDisplayTitle");
    expect(source).toContain("function useCalendarItemTitle()");
    expect(source).toContain('outOfOffice: t("outOfOffice")');
    expect(source).toContain('const title = itemTitle(item)');
    expect(source).toContain('title={title}');
    expect(source).toContain('aria-label={`${title}, ${dateLabel(segment.visibleStartDate)}');
    expect(source).toContain('title={itemTitle(item)}');
    expect(source).not.toContain("segment.item.title");
  });

  it("keeps the approved time-off title localized in both canonical message files", () => {
    expect(en.Calendar.outOfOffice).toBe("Out of office");
    expect(uk.Calendar.outOfOffice).toBe("Відсутній(-я)");
  });
});

describe("team anniversary detail localization", () => {
  it("uses the occurrence-derived duration through next-intl plural messages", () => {
    expect(source).toContain('t("teamAnniversaryDuration", { count: item.anniversaryYears })');
    expect(en.Calendar.teamAnniversaryDuration).toContain("plural");
    expect(uk.Calendar.teamAnniversaryDuration).toContain("few");
    expect(uk.Calendar.teamAnniversaryDuration).toContain("many");
  });
});

describe("admin-only salary payment reminders", () => {
  it("uses localized payment labels and keeps the filter behind the admin data boundary", () => {
    expect(source).toContain('item.source === "salary_payment" ? t("salaryPaymentEvent", { name: item.member.fullName })');
    expect(source).toContain('salaryPayments: initialData.isAdmin && param(searchParams, "payments") !== "0"');
    expect(source).toContain('if (data.isAdmin) checks.push(["salaryPayments", t("salaryPayments")])');
    expect(source).toContain('candidate.source === "calendar_event"');
    expect(en.Calendar.salaryPayments).toBe("Payments");
    expect(uk.Calendar.salaryPayments).toBe("Виплати");
    expect(en.Calendar.salaryPaymentEvent).toBe("Payment · {name}");
    expect(uk.Calendar.salaryPaymentEvent).toBe("Виплата · {name}");
    expect(en.Calendar.birthdayEvent).toBe("Birthday · {name}");
    expect(uk.Calendar.birthdayEvent).toBe("День народження · {name}");
    expect(en.Calendar.teamAnniversaryEvent).toBe("Team anniversary · {name}");
    expect(uk.Calendar.teamAnniversaryEvent).toBe("Річниця в команді · {name}");
  });
});

describe("Calendar filter menu", () => {
  it("keeps scope selectors in the toolbar and moves visibility controls into a stable localized popover", () => {
    expect(source).toContain("function CalendarFilterMenu");
    expect(source).toContain("<Popover.Content");
    expect(source).toContain('value={filters.projectId}');
    expect(source).toContain('value={filters.personId}');
    expect(source).toContain('checked={filters.mine}');
    expect(source).toContain("...DEFAULT_CALENDAR_FILTERS");
    expect(source).toContain('t("resetFilters")');
    for (const key of ["events", "projectDeadlines", "taskDeadlines", "teamAvailability", "birthdays", "teamAnniversaries", "companyDaysOff", "salaryPayments"] as const) {
      expect(source).toContain(`t("${key}")`);
    }
    expect(source).not.toContain("function FilterBar");
    expect(source).not.toContain('t("tasksOff")');
    expect(source).not.toContain('t("schedule"');
    expect(source).not.toContain('t("description")');
  });

  it("keeps the filter menu labels in English and Ukrainian parity", () => {
    for (const key of ["filters", "show", "resetFilters", "relevantToMe"] as const) {
      expect(en.Calendar[key]).toBeTruthy();
      expect(uk.Calendar[key]).toBeTruthy();
    }
  });
});

describe("Calendar viewport sizing", () => {
  it("uses one shared compact title-to-card gap and fills the Month and Week cards from the app shell", () => {
    expect(source).toContain('const fillsViewport = initialView !== "agenda"');
    expect(source).toContain('className="calendar-viewport min-w-0 space-y-3"');
    expect(source).toContain('calendar-fill-card');
    expect(source).toContain('calendar-toolbar');
    expect(source).toContain('className="calendar-month-view"');
    expect(source).toContain('className="calendar-week-view relative"');
    expect(globalStyles).toContain('@media (min-width: 1024px) and (min-height: 900px)');
    expect(globalStyles).toContain('gap: 0.75rem;');
    expect(globalStyles).not.toContain('.calendar-viewport {\n    display: flex;\n    height: 100%;');
    expect(globalStyles).toContain('flex: 1 1 0%;');
    expect(appLayout).toContain('className="flex flex-1 flex-col p-5 outline-none lg:min-h-0 lg:overflow-y-auto lg:p-8"');
    expect(globalStyles).toContain('.calendar-viewport > * + *');
    expect(globalStyles).toContain('.calendar-month-grid');
    expect(source).toContain('gridTemplateRows: `repeat(${desktopWeekCount}, minmax(0, 1fr))`');
  });

  it("lets the Week timeline fill and scale within its available card height", () => {
    expect(source).toContain('const [pixelsPerMinute, setPixelsPerMinute] = useState(WEEK_MIN_PIXELS_PER_MINUTE);');
    expect(source).toContain('new ResizeObserver(updateScale)');
    expect(source).toContain('const WEEK_VIEWPORT_WINDOW_MINUTES = 11 * 60;');
    expect(source).toContain('const WEEK_MIN_PIXELS_PER_MINUTE = 0.92;');
    expect(source).toContain('Math.max(WEEK_MIN_PIXELS_PER_MINUTE, container.clientHeight / WEEK_VIEWPORT_WINDOW_MINUTES)');
    expect(source).toContain('height: 24 * 60 * pixelsPerMinute');
    expect(source).toContain('top: segment.startMinute * pixelsPerMinute');
    expect(source).toContain('height: getTimedEventHeight(segment.startMinute, segment.endMinute, pixelsPerMinute)');
    expect(source).toContain('border-[var(--ui-border)]');
    expect(globalStyles).toContain('.calendar-week-timeline');
    expect(globalStyles).toContain('max-height: none;');
    expect(globalStyles).toContain('--ui-calendar-gridline: var(--ui-border);');
  });

  it("keeps Month overflow bounded inside the equal-height row budget", () => {
    expect(source).toContain('const visibleTimedItems = timedItems.slice(0, Math.max(0, visibleLaneCount - dateLaneLayout.laneCount));');
    expect(source).toContain('const overflow = hiddenSpanningItems.size + timedItems.length - visibleTimedItems.length;');
    expect(source).toContain('calendar-month-overflow');
    expect(globalStyles).toContain('.calendar-month-day {\n    overflow: hidden;');
  });
});
