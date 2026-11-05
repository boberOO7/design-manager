"use client";

import { useImperativeHandle, useLayoutEffect, useMemo, useState, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { formatCalendarTime, WEEK_PIXELS_PER_MINUTE, type TimedWeekLayoutSegment } from "@/lib/calendar";
import { getWeekEventEditLayout, getWeekEventPreviewSegments, type WeekEventPreview } from "@/lib/calendar-week-edit";
import { getCalendarEventTypeConfig } from "@/lib/calendar-event-types";
import type { CalendarTimeFormat } from "@/types/calendar";
import { WeekEventContent } from "./calendar-week-event-content";

export type WeekEditPreviewHandle = { update: (preview: WeekEventPreview | null) => void };

/** Pointer frames render this small layer, never the calendar's cards and tooltips. */
export function WeekEditPreview({ ref, segments, dates, timeZone, timeFormat, container, onLayoutChange }: {
  ref: Ref<WeekEditPreviewHandle>;
  segments: TimedWeekLayoutSegment[];
  dates: string[];
  timeZone: string;
  timeFormat: CalendarTimeFormat;
  container: RefObject<HTMLDivElement | null>;
  onLayoutChange: (layout: TimedWeekLayoutSegment[] | null) => void;
}) {
  const t = useTranslations("Calendar");
  const [preview, setPreview] = useState<WeekEventPreview | null>(null);
  useImperativeHandle(ref, () => ({ update: setPreview }), []);
  const item = preview?.item;
  const label = useMemo(() => item ? `${formatCalendarTime(item.startsAt, timeFormat, timeZone)}–${formatCalendarTime(item.endsAt, timeFormat, timeZone)}` : "", [item, timeFormat, timeZone]);
  const layout = useMemo(() => preview ? getWeekEventEditLayout(segments, getWeekEventPreviewSegments(preview, dates, timeZone), preview.item.key, preview.sourceDate) : null, [preview, segments, dates, timeZone]);
  useLayoutEffect(() => { onLayoutChange(layout); }, [layout, onLayoutChange]);
  if (!preview) return null;
  const { Icon, tone } = getCalendarEventTypeConfig(preview.item.eventType);
  const activeLabel = preview.valid ? label : t("invalidDateRange");
  return layout?.filter((segment) => segment.itemId === preview.item.key).map((segment) => {
    const column = container.current?.querySelector<HTMLElement>(`[data-week-date="${segment.date}"]`);
    if (!column) return null;
    return createPortal(<div role="status" aria-label={`${preview.item.title}, ${activeLabel}`} className="calendar-week-edit-preview pointer-events-none absolute top-0 z-30" style={{ transform: `translateY(${segment.startMinute * WEEK_PIXELS_PER_MINUTE}px)`, height: (segment.endMinute - segment.startMinute) * WEEK_PIXELS_PER_MINUTE, left: `calc(${(segment.column / segment.columnCount) * 100}% + 2px)`, width: `calc(${100 / segment.columnCount}% - 4px)` }}><div data-preview="" className={`calendar-week-event absolute inset-0 w-full overflow-hidden border-l-2 text-left text-xs font-medium ${preview.valid ? tone : "bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]"}`}><WeekEventContent title={preview.item.title} timeLabel={activeLabel} location={preview.item.location} icon={<Icon aria-hidden="true" className="size-3 shrink-0 stroke-[1.75]" />} /></div></div>, column, segment.segmentId);
  });
}
