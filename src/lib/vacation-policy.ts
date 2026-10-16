import { z } from "zod";

export const vacationRecalculationPreviewSchema = z.object({
  asOf: z.iso.date(),
  digest: z.string().regex(/^[a-f0-9]{32}$/),
  hasShortfall: z.boolean(),
  employees: z.array(z.object({
    userId: z.uuid(), name: z.string(), accrualFrom: z.iso.date().nullable(), openingDays: z.number().int().nonnegative().nullable(),
    before: z.number().int().nullable(), after: z.number().int().nullable(), delta: z.number().int().nullable(), changed: z.boolean(),
    usedDays: z.number().int().nonnegative(), reservedDays: z.number().int().nonnegative(),
    minimumBalance: z.number().int().nullable(), shortfallDate: z.iso.date().nullable(),
  })),
});

export type VacationRecalculationPreview = z.infer<typeof vacationRecalculationPreviewSchema>;
