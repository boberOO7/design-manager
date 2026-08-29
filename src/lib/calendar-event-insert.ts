import type { CalendarEventInput } from "./validation/calendar";

export type VerifiedCalendarEventMembership = {
  userId: string;
  studioId: string;
  systemRole: "admin" | "employee";
  isActive: boolean;
};

export type CalendarEventInsertPayload = {
  studio_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  event_type: CalendarEventInput["eventType"];
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  meeting_url: string | null;
  meeting_mode: CalendarEventInput["meetingMode"];
  created_by: string;
  organizer_id: string;
  recurrence_rule: CalendarEventInput["recurrenceRule"];
  compensates_time_off_request_id: string | null;
  assignee_id: string | null;
};

export function verifyCalendarEventMembership(
  membership: VerifiedCalendarEventMembership,
  authenticatedUserId: string,
): VerifiedCalendarEventMembership | null {
  if (
    membership.userId !== authenticatedUserId
    || !membership.isActive
  ) {
    return null;
  }

  return membership;
}

export function createCalendarEventInsertPayload(
  input: CalendarEventInput,
  authenticatedUserId: string,
  membership: VerifiedCalendarEventMembership,
): CalendarEventInsertPayload {
  const verifiedMembership = verifyCalendarEventMembership(membership, authenticatedUserId);
  if (!verifiedMembership) {
    throw new Error("The authenticated user does not have an active studio membership.");
  }

  return {
    studio_id: verifiedMembership.studioId,
    project_id: input.projectId ?? null,
    title: input.title,
    description: input.description,
    event_type: input.eventType,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    all_day: input.allDay,
    location: input.location,
    meeting_url: input.meetingUrl,
    meeting_mode: input.meetingMode,
    created_by: authenticatedUserId,
    organizer_id: authenticatedUserId,
    recurrence_rule: input.recurrenceRule,
    compensates_time_off_request_id: input.compensatesTimeOffRequestId,
    assignee_id: input.assigneeId,
  };
}
