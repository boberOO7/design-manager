import { z } from "zod";
export const tripRecognitionSourceSchema = z.object({
  id: z.uuid(), tripId: z.uuid(), projectId: z.uuid().nullable(), description: z.string(), date: z.iso.date(),
  amount: z.string().regex(/^\d+(?:\.\d+)?$/), currency: z.string(), reportingAmount: z.string().regex(/^\d+(?:\.\d+)?$/).nullable(), reportingCurrency: z.string(),
});
export type TripRecognitionSource = z.infer<typeof tripRecognitionSourceSchema>;
export const tripRecognitionConfirmationSchema = z.object({ requestId: z.uuid(), entryId: z.uuid(), reason: z.string().trim().min(1).max(2000) });
