import type { TimeOffRequestType, TimeOffStatus } from "@/types/calendar";

export const timeOffRequestTypeKey: Record<TimeOffRequestType, "vacation" | "dayOff" | "medicalAppointment" | "sickLeave" | "other"> = {
  vacation: "vacation", day_off: "dayOff", medical_appointment: "medicalAppointment", sick_leave: "sickLeave", other: "other",
};

export const timeOffStatusKey: Record<TimeOffStatus, "pending" | "approved" | "rejected" | "cancelled"> = {
  pending: "pending", approved: "approved", rejected: "rejected", cancelled: "cancelled",
};
