import type { ReactNode } from "react";

/** The stored card and its moving preview share typography and compact states. */
export function WeekEventContent({ title, timeLabel, location, icon }: {
  title: string;
  timeLabel: string;
  location?: string | null;
  icon: ReactNode;
}) {
  return <span className="calendar-week-event-content"><span className="calendar-week-event-title flex min-w-0 items-center gap-1 leading-4"><span className="calendar-week-event-icon">{icon}</span><span className="min-w-0 flex-1 truncate">{title}</span></span><span className="calendar-week-event-meta truncate text-[10px] font-normal leading-3"><span>{timeLabel}</span>{location ? <span className="calendar-week-event-location">{` · ${location}`}</span> : null}</span></span>;
}
