"use client";

import { useImperativeHandle, useRef, useState, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import { WEEK_PIXELS_PER_MINUTE } from "@/lib/calendar";
import { getWeekCreationRange } from "@/lib/calendar-week-selection";
import type { CalendarEventFormRange } from "@/lib/calendar-event-form";

export type WeekCreationPreviewHandle = { update: (slot: { date: string; minute: number } | null) => void };

export function WeekCreationPreview({ ref, container, dates }: {
  ref: Ref<WeekCreationPreviewHandle>;
  container: RefObject<HTMLDivElement | null>;
  dates: string[];
}) {
  const [range, setRange] = useState<CalendarEventFormRange | null>(null);
  const current = useRef<CalendarEventFormRange | null>(null);
  useImperativeHandle(ref, () => ({ update(slot) {
    const next = slot ? getWeekCreationRange(slot.date, slot.minute) : null;
    if (next?.startDate === current.current?.startDate && next?.startTime === current.current?.startTime) return;
    current.current = next;
    setRange(next);
  } }), []);
  if (!range) return null;
  const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return dates.filter((date) => date >= range.startDate && date <= range.endDate).map((date) => {
    const column = container.current?.querySelector<HTMLElement>(`[data-week-date="${date}"]`);
    const start = date === range.startDate ? minute(range.startTime) : 0;
    const end = date === range.endDate ? minute(range.endTime) : 1440;
    if (!column || end <= start) return null;
    return createPortal(<div aria-hidden="true" className="calendar-week-creation-preview pointer-events-none absolute inset-x-0 z-0" style={{ top: start * WEEK_PIXELS_PER_MINUTE, height: (end - start) * WEEK_PIXELS_PER_MINUTE }} />, column, date);
  });
}
