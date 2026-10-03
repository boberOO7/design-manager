import { z } from "zod";

export const employeeProfileNoteSchema = z.object({
  employeeId: z.uuid(),
  reviewMonth: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/),
  note: z.string().trim().min(1),
});
