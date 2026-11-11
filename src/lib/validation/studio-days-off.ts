import { z } from "zod";

const fields = {
  name: z.string().trim().min(1).max(160),
  note: z.string().trim().max(2000).nullish().transform((value) => value || null),
};

export const studioDayOffPeriodSchema = z.object({ ...fields, startDate: z.iso.date(), endDate: z.iso.date() }).strict()
  .refine((value) => value.endDate >= value.startDate, { path: ["endDate"], message: "The last date must not precede the start." });
const singleDaySchema = z.object({ ...fields, date: z.iso.date() }).strict();
const separateDatesSchema = z.object({ ...fields, dates: z.array(z.iso.date()).min(1) }).strict()
  .refine((value) => new Set(value.dates).size === value.dates.length, { path: ["dates"], message: "Choose each date once." });

export const studioDaysOffCreateSchema = z.union([studioDayOffPeriodSchema, separateDatesSchema, singleDaySchema]);
export const studioDayOffUpdateSchema = z.union([studioDayOffPeriodSchema, singleDaySchema]);
export const studioDaysOffDeleteSchema = z.object({ ids: z.array(z.uuid()).min(1) }).strict();
