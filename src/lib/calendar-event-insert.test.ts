import { describe, expect, it } from "vitest";
import {
  createCalendarEventInsertPayload,
  verifyCalendarEventMembership,
  type VerifiedCalendarEventMembership,
} from "./calendar-event-insert";
import { calendarEventSchema } from "./validation/calendar";

const authenticatedUserId = "123e4567-e89b-12d3-a456-426614174000";
const studioId = "123e4567-e89b-12d3-a456-426614174001";

const membership: VerifiedCalendarEventMembership = {
  userId: authenticatedUserId,
  studioId,
  systemRole: "admin",
  isActive: true,
};

const eventInput = {
  title: "Studio meeting",
  eventType: "meeting" as const,
  projectId: null,
  allDay: false,
  startsAt: "2026-07-28T06:00:00.000Z",
  endsAt: "2026-07-28T07:00:00.000Z",
  attendeeIds: [],
  location: "",
  meetingUrl: "",
  meetingMode: "offline",
  description: "",
};

describe("Calendar event insert authority", () => {
  it("derives created_by solely from the authenticated user and studio_id solely from membership", () => {
    const input = calendarEventSchema.parse(eventInput);
    const payload = createCalendarEventInsertPayload(input, authenticatedUserId, membership);

    expect(payload.created_by).toBe(authenticatedUserId);
    expect(payload.studio_id).toBe(studioId);
    expect(payload.project_id).toBeNull();
  });

  it("rejects browser-supplied studio and creator identifiers", () => {
    expect(calendarEventSchema.safeParse({ ...eventInput, studioId, createdBy: authenticatedUserId }).success).toBe(false);
  });

  it("keeps Studio-wide events bound to the verified membership studio", () => {
    const payload = createCalendarEventInsertPayload(calendarEventSchema.parse(eventInput), authenticatedUserId, membership);
    expect(payload).toMatchObject({ project_id: null, studio_id: studioId });
  });

  it("accepts an active employee membership and rejects inactive or mismatched memberships", () => {
    expect(verifyCalendarEventMembership({ ...membership, isActive: false }, authenticatedUserId)).toBeNull();
    expect(verifyCalendarEventMembership({ ...membership, systemRole: "employee" }, authenticatedUserId)).toMatchObject({ systemRole: "employee" });
    expect(verifyCalendarEventMembership({ ...membership, userId: "123e4567-e89b-12d3-a456-426614174002" }, authenticatedUserId)).toBeNull();
  });
});
