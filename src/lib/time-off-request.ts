import { canTransitionTimeOff } from "@/lib/calendar";
import type { TimeOffStatus } from "@/types/calendar";

export type TimeOffAction = "approve" | "reject" | "cancel";
export type TimeOffActorRole = "admin" | "employee";

export type TimeOffUpdate =
  | { status: "approved" | "rejected"; reviewed_by: string; reviewed_at: string; review_note: string | null }
  | { status: "cancelled"; cancelled_at: string };

export function deriveTimeOffUpdate(input: {
  action: TimeOffAction;
  actorId: string;
  actorRole: TimeOffActorRole;
  ownerId: string;
  currentStatus: TimeOffStatus;
  reviewNote: string | null;
  now: string;
}): TimeOffUpdate | null {
  const nextStatus: TimeOffStatus = input.action === "approve"
    ? "approved"
    : input.action === "reject"
      ? "rejected"
      : "cancelled";

  if (
    (input.actorRole === "employee" && input.ownerId !== input.actorId)
    || !canTransitionTimeOff(input.currentStatus, nextStatus, input.actorRole)
  ) {
    return null;
  }

  if (nextStatus === "cancelled") {
    return { status: nextStatus, cancelled_at: input.now };
  }

  return {
    status: nextStatus,
    reviewed_by: input.actorId,
    reviewed_at: input.now,
    review_note: input.reviewNote,
  };
}

export function timeOffUpdateFields(update: TimeOffUpdate): string[] {
  return Object.keys(update).sort();
}
