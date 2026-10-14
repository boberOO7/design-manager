import type { Metadata } from "next";
import { CalendarStream } from "@/components/calendar/calendar-workspace";
import { getCalendarStreams } from "@/data/queries/calendar";
import { getCalendarRange, instantToDateOnly } from "@/lib/calendar";
import type { CalendarView } from "@/types/calendar";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Navigation");
  return { title: t("calendar") };
}

function validDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : instantToDateOnly(new Date().toISOString());
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedView = typeof params.view === "string" ? params.view : "week";
  const view: CalendarView = requestedView === "month" || requestedView === "week" || requestedView === "agenda" ? requestedView : "week";
  const date = validDate(typeof params.date === "string" ? params.date : undefined);
  // Start every read before preparing the correctly zoned shell, as other InstaLoad routes do.
  const streams = await getCalendarStreams(getCalendarRange(view, date));
  if (!streams) throw new Error("Calendar data is unavailable for the active studio.");
  const preferences = await streams.preferences;
  const refreshKey = typeof params.refresh === "string" ? params.refresh : "";
  return <CalendarStream key={`${view}:${date}:${refreshKey}`} streams={{ data: streams.data, projects: streams.projects, people: streams.people }} initialView={view} initialDate={date} preferences={preferences} />;
}
