import type { TimeOffRequestType, TimeOffStatus } from "@/types/calendar";

type TimeOffFieldLabelKey = "reason" | "note";
type TimeOffPlaceholderKey = "dayOffReasonPlaceholder";

export type TimeOffRequestPresentation = {
  fieldLabelKey: TimeOffFieldLabelKey;
  placeholderKey?: TimeOffPlaceholderKey;
  requiresReason: boolean;
  supportsPartialDay: boolean;
};

const TIME_OFF_REQUEST_PRESENTATION: Record<TimeOffRequestType, TimeOffRequestPresentation> = {
  vacation: { fieldLabelKey: "note", requiresReason: false, supportsPartialDay: false },
  day_off: { fieldLabelKey: "reason", placeholderKey: "dayOffReasonPlaceholder", requiresReason: true, supportsPartialDay: true },
  medical_appointment: { fieldLabelKey: "reason", requiresReason: false, supportsPartialDay: true },
  sick_leave: { fieldLabelKey: "note", requiresReason: false, supportsPartialDay: true },
  other: { fieldLabelKey: "reason", requiresReason: true, supportsPartialDay: true },
};

export function getTimeOffRequestPresentation(requestType: TimeOffRequestType): TimeOffRequestPresentation {
  return TIME_OFF_REQUEST_PRESENTATION[requestType];
}

export function requiresTimeOffReason(requestType: TimeOffRequestType): boolean {
  return getTimeOffRequestPresentation(requestType).requiresReason;
}

export const timeOffRequestTypeKey: Record<TimeOffRequestType, "vacation" | "dayOff" | "medicalAppointment" | "sickLeave" | "other"> = {
  vacation: "vacation", day_off: "dayOff", medical_appointment: "medicalAppointment", sick_leave: "sickLeave", other: "other",
};

export const timeOffStatusKey: Record<TimeOffStatus, "pending" | "approved" | "rejected" | "cancelled"> = {
  pending: "pending", approved: "approved", rejected: "rejected", cancelled: "cancelled",
};
