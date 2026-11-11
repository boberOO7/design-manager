import { z } from "zod";
import { addCalendarDays } from "@/lib/calendar";
import type { Database } from "@/types/database.types";
import type { CalendarItem } from "@/types/calendar";

export const STUDIO_DAY_OFF_COLUMNS = "id, date, end_date, name, note";
export type StudioDayOffRecord = Pick<Database["public"]["Tables"]["studio_days_off"]["Row"], "id" | "date" | "end_date" | "name" | "note">;
export const studioDayOffRecordSchema: z.ZodType<StudioDayOffRecord> = z.object({
  id: z.uuid(), date: z.iso.date(), end_date: z.iso.date().nullable(), name: z.string(), note: z.string().nullable(),
});
export const studioDaysOffResponseSchema = z.object({ success: z.literal(true), daysOff: z.array(studioDayOffRecordSchema) });
export const studioDaysOffDeleteResponseSchema = z.object({ success: z.literal(true), ids: z.array(z.uuid()) });

export function studioDayOffItem(record: StudioDayOffRecord): Extract<CalendarItem, { source: "studio_day_off" }> {
  return { source: "studio_day_off", key: `studio-day-off:${record.id}`, id: record.id, title: record.name, note: record.note,
    startDate: record.date, endDate: record.end_date ?? record.date, allDay: true, projectId: null, personIds: [] };
}

/** Expand only the requested window for consumers that classify individual workdays. */
export function getStudioDayOffDates(records: Pick<StudioDayOffRecord, "date" | "end_date">[], { start, end }: { start: string; end: string }): string[] {
  const dates = new Set<string>();
  for (const record of records) {
    const first = record.date > start ? record.date : start;
    const last = (record.end_date ?? record.date) < end ? record.end_date ?? record.date : end;
    for (let date = first; date <= last; date = addCalendarDays(date, 1)) dates.add(date);
  }
  return [...dates].sort();
}
