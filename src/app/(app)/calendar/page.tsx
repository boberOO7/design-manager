import type { Metadata } from "next";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { getCalendarData } from "@/data/queries/calendar";
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
  const requestedView = typeof params.view === "string" ? params.view : "month";
  const view: CalendarView = requestedView === "week" || requestedView === "agenda" ? requestedView : "month";
  const date = validDate(typeof params.date === "string" ? params.date : undefined);
  const range = getCalendarRange(view, date);
  const data = await getCalendarData(range);
  if (!data) throw new Error("Calendar data is unavailable for the active studio.");

  const refreshKey = typeof params.refresh === "string" ? params.refresh : "";
  return <CalendarWorkspace key={`${view}:${date}:${refreshKey}`} initialData={data} initialView={view} initialDate={date} searchParams={params} />;
}
