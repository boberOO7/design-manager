import { z } from "zod";
import { OFFICE_ASSIGNMENT_PRIORITIES, OFFICE_ASSIGNMENT_STATUSES } from "@/lib/office-assignments";

const optionalDate = z.union([z.iso.date(), z.literal("")]).transform((value) => value || null);

export const createOfficeAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000),
  responsibleId: z.string().uuid(),
  priority: z.enum(OFFICE_ASSIGNMENT_PRIORITIES),
  deadline: optionalDate,
});

export const transitionOfficeAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  status: z.enum(OFFICE_ASSIGNMENT_STATUSES),
});

export const manageOfficeAssignmentSchema = transitionOfficeAssignmentSchema.extend({
  responsibleId: z.string().uuid(),
  priority: z.enum(OFFICE_ASSIGNMENT_PRIORITIES),
  deadline: z.iso.date().nullable(),
});

export type OfficeAssignmentActionState = { success?: boolean; assignmentId?: string; error?: string };
