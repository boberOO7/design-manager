import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

const source = readFileSync(new URL("./calendar-workspace.tsx", import.meta.url), "utf8");

describe("Calendar event form localization contract", () => {
  it("renders create and edit forms from canonical next-intl messages", () => {
    expect(source).toContain('const t = useTranslations("Calendar")');
    expect(source).toContain('item ? t("editEventTitle") : t("addEventTitle")');
    expect(source).toContain('getCreatableCalendarEventTypes');
    expect(source).toContain('t("addEvent")');
    expect(source).toContain('t("absence")');
    expect(source).toContain('t("requestTimeOff")');
    expect(source).not.toContain('function CreationForm');
    expect(source).toContain('t(eventTypeKey[type])');
    expect(source).toContain('<InviteePicker');
    expect(source).toContain('UserRoundSearch');
    expect(source).toContain('item.eventType === "interview"');
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
    expect(en.Calendar.salaryPaymentEvent).toBe("💰 Payment · {name}");
    expect(uk.Calendar.salaryPaymentEvent).toBe("💰 Виплата · {name}");
  });
});
