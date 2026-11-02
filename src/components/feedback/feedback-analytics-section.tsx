import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getFeedbackAnalytics } from "@/data/queries/feedback";
import { FeedbackAnalytics } from "@/components/feedback/feedback-analytics";
import { FeedbackAnalyticsFilters } from "@/components/feedback/feedback-analytics-filters";
import { getFeedbackExpiryAt } from "@/lib/feedback";
import { zonedWallTimeToIso } from "@/lib/calendar";
import type { StatisticsPeriod } from "@/lib/statistics";

const filterSchema = z.object({ from: z.union([z.iso.date(), z.literal("")]).optional(), to: z.union([z.iso.date(), z.literal("")]).optional(), project: z.union([z.uuid(), z.literal("")]).optional() }).refine(value => !value.from || !value.to || value.from <= value.to);
export async function FeedbackAnalyticsSection({ searchParams, period }: { searchParams: Record<string, string | string[] | undefined>; period: StatisticsPeriod }) {
  const t = await getTranslations("Feedback");
  const parsed = filterSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : {};
  const data = await getFeedbackAnalytics({ from: filters.from ? zonedWallTimeToIso(`${filters.from}T00:00`) ?? undefined : undefined, to: filters.to ? getFeedbackExpiryAt(filters.to) ?? undefined : undefined, projectId: filters.project || undefined });
  if (!data) notFound();
  return <section aria-label={t("title")} className="space-y-6"><p className="text-sm text-[var(--ui-text-muted)]">{t("analyticsDescription")}</p>
    <FeedbackAnalyticsFilters key={JSON.stringify([filters, parsed.success])} initialFilters={{ from: filters.from ?? "", to: filters.to ?? "", project: filters.project ?? "" }} invalidFilters={!parsed.success} period={period} projects={data.projects} />
    <FeedbackAnalytics {...data} />
  </section>;
}
