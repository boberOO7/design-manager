"use client";

import { useSearchParams } from "next/navigation";
import { CalendarBlueprint } from "@/components/calendar/calendar-workspace";
import { normalizeCalendarTimeFormat, normalizeCalendarTimeZone } from "@/lib/calendar";
import { resolveCalendarSelection } from "@/lib/calendar-navigation";

export default function CalendarLoading() {
  const params = useSearchParams();
  const { view, date } = resolveCalendarSelection(
    params.getAll("view").length === 1 ? params.get("view") : undefined,
    params.getAll("date").length === 1 ? params.get("date") : undefined,
  );

  return <CalendarBlueprint initialView={view} initialDate={date}
    timeFormat={normalizeCalendarTimeFormat(undefined)} timeZone={normalizeCalendarTimeZone(undefined)} />;
}
