import { canTransitionTimeOff } from "@/lib/calendar";
import type { TimeOffStatus } from "@/types/calendar";

export type TimeOffAction = "approve" | "reject" | "cancel";
export type TimeOffActorRole = "admin" | "employee";

export type TimeOffUpdate = { status: "cancelled"; cancelled_at: string };

export function deriveTimeOffUpdate(input: {
  action: TimeOffAction;
  actorId: string;
  actorRole: TimeOffActorRole;
  ownerId: string;
  currentStatus: TimeOffStatus;
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

  return nextStatus === "cancelled" ? { status: nextStatus, cancelled_at: input.now } : null;
}

export function timeOffUpdateFields(update: TimeOffUpdate): string[] {
  return Object.keys(update).sort();
}
