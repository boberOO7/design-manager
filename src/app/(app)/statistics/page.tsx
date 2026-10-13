import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStatisticsStreams } from "@/data/queries/statistics";
import { parseStatisticsPeriod, parseStatisticsSection } from "@/lib/statistics";
import { StatisticsReportView } from "@/components/statistics/statistics-report";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Statistics");
  return { title: t("title") };
}

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<{ period?: string | string[]; section?: string | string[] }> }) {
  const t = await getTranslations("Statistics");
  const params = await searchParams;
  const period = parseStatisticsPeriod(params.period);
  const section = parseStatisticsSection(params.section);
  let streams;
  try {
    streams = await getStatisticsStreams(period);
  } catch (error) {
    console.error("Unable to load Statistics", error);
    return <div role="alert" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-5 text-sm text-[var(--ui-danger-text)]">{t("loadFailed")}</div>;
  }
  if (!streams) redirect("/dashboard");
  return <StatisticsReportView streams={streams} section={section} />;
}
