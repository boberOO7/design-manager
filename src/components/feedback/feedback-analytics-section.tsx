import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getFeedbackAnalytics } from "@/data/queries/feedback";
import { FeedbackAnalytics } from "@/components/feedback/feedback-analytics";
import { Button } from "@/components/ui/button";
import { FormField, Input, inputClassName } from "@/components/ui/form-field";
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
    <form key={JSON.stringify(filters)} action="/statistics" className="flex flex-wrap items-end gap-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5" method="get"><input type="hidden" name="section" value="feedback" /><input type="hidden" name="period" value={period} /><FormField label={t("from")}><Input name="from" type="date" defaultValue={filters.from} /></FormField><FormField label={t("to")}><Input name="to" type="date" defaultValue={filters.to} /></FormField><FormField label={t("project")}><select aria-label={t("project")} name="project" defaultValue={filters.project} className={inputClassName}><option value="">{t("allProjects")}</option>{data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></FormField><Button type="submit">{t("applyFilters")}</Button><Link href={`/statistics?period=${period}&section=feedback`} className="inline-flex min-h-11 items-center px-3 text-sm underline">{t("resetFilters")}</Link><p className="basis-full text-xs leading-5 text-[var(--ui-text-muted)]">{t("periodHint")}</p>{!parsed.success ? <p role="alert" className="basis-full text-sm text-[var(--ui-danger-text)]">{t("invalidFilters")}</p> : null}</form>
    <FeedbackAnalytics {...data} />
  </section>;
}
