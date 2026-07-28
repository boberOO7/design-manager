import { describe, expect, it } from "vitest";
import {
  createCalendarEventInsertPayload,
  verifyCalendarEventAdminMembership,
  type VerifiedCalendarEventAdminMembership,
} from "./calendar-event-insert";
import { calendarEventSchema } from "./validation/calendar";

const authenticatedUserId = "123e4567-e89b-12d3-a456-426614174000";
const studioId = "123e4567-e89b-12d3-a456-426614174001";

const membership: VerifiedCalendarEventAdminMembership = {
  userId: authenticatedUserId,
  studioId,
  systemRole: "admin",
  isActive: true,
};

const eventInput = {
  title: "Studio meeting",
  eventType: "meeting" as const,
  projectId: null,
  allDay: true,
  startsAt: "2026-07-28T21:00:00.000Z",
  endsAt: "2026-07-29T21:00:00.000Z",
  attendeeIds: [],
  location: "",
  meetingUrl: "",
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

  it("rejects inactive, employee, and mismatched administrator memberships before insert", () => {
    expect(verifyCalendarEventAdminMembership({ ...membership, isActive: false }, authenticatedUserId)).toBeNull();
    expect(verifyCalendarEventAdminMembership({ ...membership, systemRole: "employee" }, authenticatedUserId)).toBeNull();
    expect(verifyCalendarEventAdminMembership({ ...membership, userId: "123e4567-e89b-12d3-a456-426614174002" }, authenticatedUserId)).toBeNull();
  });
});
