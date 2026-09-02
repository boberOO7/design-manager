import { describe, expect, it } from "vitest";
import { CALENDAR_EVENT_DETAIL_CONFIG, CALENDAR_EVENT_TYPE_CONFIG } from "./calendar-event-types";

describe("calendar event semantic types", () => {
  it("provides a localized label, semantic tone, and icon for every persisted type", () => {
    expect(Object.keys(CALENDAR_EVENT_TYPE_CONFIG)).toEqual(["general", "meeting", "interview", "site_visit", "business_trip", "presentation", "internal_review", "work_makeup"]);
    expect(CALENDAR_EVENT_TYPE_CONFIG.presentation.labelKey).toBe("presentation");
    expect(CALENDAR_EVENT_TYPE_CONFIG.business_trip.tone).toContain("business-trip");
  });

  it("maps detail sections to the fields persisted by each event form", () => {
    expect(CALENDAR_EVENT_DETAIL_CONFIG.site_visit.sections).toEqual(["project", "assignee", "location"]);
    expect(CALENDAR_EVENT_DETAIL_CONFIG.site_visit.assigneeLabel).toBe("executor");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.site_visit.sections).not.toContain("invitations");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.business_trip.sections).toContain("participants");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.interview.sections).toEqual(["assignee", "meetingUrl"]);
    expect(CALENDAR_EVENT_DETAIL_CONFIG.interview.assigneeLabel).toBe("interviewer");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.meeting.invitationLabel).toBe("participants");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.meeting.sections).toContain("meetingMode");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.meeting.organizerLabel).toBe("organizer");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.presentation.organizerLabel).toBe("presenter");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.general.invitationLabel).toBe("invitees");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.general.sections).not.toContain("organizer");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.internal_review.sections).toContain("recurrence");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.internal_review.sections).not.toContain("organizer");
    expect(CALENDAR_EVENT_DETAIL_CONFIG.work_makeup.sections).toEqual(["linkedDayOff"]);
  });
});
