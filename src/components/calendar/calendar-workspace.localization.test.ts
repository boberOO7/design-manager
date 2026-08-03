import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";

const source = readFileSync(new URL("./calendar-workspace.tsx", import.meta.url), "utf8");

describe("Calendar event form localization contract", () => {
  it("renders create and edit forms from canonical next-intl messages", () => {
    expect(source).toContain('const t = useTranslations("Calendar")');
    expect(source).toContain('item ? t("editEventTitle") : t("addEventTitle")');
    expect(source).toContain('CALENDAR_EVENT_TYPES.map((type)');
    expect(source).toContain('t(eventTypeKey[type])');
    expect(source).toContain('roles(roleKey)');
    expect(source).not.toContain('title={item ? "Edit event" : "Add event"}');
  });

  it("keeps English and Ukrainian event-form keys in parity", () => {
    const keys = ["eventForm", "addEventTitle", "editEventTitle", "titleLabel", "type", "project", "allDayEvent", "startDate", "endDate", "startTime", "endTime", "attendees", "location", "meetingUrl", "descriptionLabel", "saveEvent", "saving", "eventSaveFailed"] as const;
    for (const key of keys) {
      expect(en.Calendar[key]).toBeTruthy();
      expect(uk.Calendar[key]).toBeTruthy();
    }
  });
});

describe("time-off form localization contract", () => {
  it("renders the real request form from canonical next-intl messages", () => {
    expect(source).toContain('const t = useTranslations("TimeOff")');
    expect(source).toContain('TIME_OFF_REQUEST_TYPES.map((type)');
    expect(source).toContain('t(timeOffRequestTypeKey[type])');
    expect(source).toContain('calendar("requestTimeOffTitle")');
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
