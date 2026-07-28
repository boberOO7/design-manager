import type { CalendarEventInput } from "./validation/calendar";

export type VerifiedCalendarEventAdminMembership = {
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
  created_by: string;
};

export function verifyCalendarEventAdminMembership(
  membership: VerifiedCalendarEventAdminMembership,
  authenticatedUserId: string,
): VerifiedCalendarEventAdminMembership | null {
  if (
    membership.userId !== authenticatedUserId
    || membership.systemRole !== "admin"
    || !membership.isActive
  ) {
    return null;
  }

  return membership;
}

export function createCalendarEventInsertPayload(
  input: CalendarEventInput,
  authenticatedUserId: string,
  membership: VerifiedCalendarEventAdminMembership,
): CalendarEventInsertPayload {
  const verifiedMembership = verifyCalendarEventAdminMembership(membership, authenticatedUserId);
  if (!verifiedMembership) {
    throw new Error("The authenticated user does not have an active administrator membership.");
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
    created_by: authenticatedUserId,
  };
}
