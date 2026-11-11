import type { Metadata } from "next";
import { CalendarStream } from "@/components/calendar/calendar-workspace";
import { getCalendarStreams } from "@/data/queries/calendar";
import { getCalendarWorkspaceRange, resolveCalendarSelection } from "@/lib/calendar-navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Navigation");
  return { title: t("calendar") };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { view, date } = resolveCalendarSelection(params.view, params.date);
  // Start every read before preparing the correctly zoned shell, as other InstaLoad routes do.
  const streams = await getCalendarStreams(getCalendarWorkspaceRange(date));
  if (!streams) throw new Error("Calendar data is unavailable for the active studio.");
  const preferences = await streams.preferences;
  const refreshKey = typeof params.refresh === "string" ? params.refresh : "";
  return <CalendarStream key={`${date}:${refreshKey}`} streams={{ data: streams.data, projects: streams.projects, people: streams.people }} initialView={view} initialDate={date} preferences={preferences} />;
}
