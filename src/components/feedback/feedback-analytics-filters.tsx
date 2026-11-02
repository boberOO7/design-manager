"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { StatisticsPeriod } from "@/lib/statistics";

export function FeedbackAnalyticsFilters({ initialFilters, invalidFilters, period, projects }: {
  initialFilters: { from: string; to: string; project: string };
  invalidFilters: boolean;
  period: StatisticsPeriod;
  projects: { id: string; name: string }[];
}) {
  const t = useTranslations("Feedback");
  const locale = useLocale();
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const hasAppliedFilters = Boolean(initialFilters.from || initialFilters.to || initialFilters.project);
  const canReset = Boolean(filters.from || filters.to || filters.project || hasAppliedFilters || invalidFilters);

  function resetFilters() {
    setFilters({ from: "", to: "", project: "" });
    if (hasAppliedFilters || invalidFilters) router.replace(`/statistics?period=${period}&section=feedback`, { scroll: false });
  }

  return <form action="/statistics" className="flex flex-wrap items-end gap-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5" method="get">
    <input type="hidden" name="section" value="feedback" />
    <input type="hidden" name="period" value={period} />
    <FormField as="div" label={t("from")} className="w-full sm:w-40">
      <DatePicker aria-label={t("from")} name="from" value={filters.from} onValueChange={from => setFilters(current => ({ ...current, from }))} locale={locale} />
    </FormField>
    <FormField as="div" label={t("to")} className="w-full sm:w-40">
      <DatePicker aria-label={t("to")} name="to" value={filters.to} onValueChange={to => setFilters(current => ({ ...current, to }))} locale={locale} />
    </FormField>
    <FormField as="div" label={t("project")} className="w-full sm:w-72">
      <Select aria-label={t("project")} name="project" value={filters.project} onValueChange={project => setFilters(current => ({ ...current, project }))}>
        <SelectItem value="">{t("allProjects")}</SelectItem>
        {projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
      </Select>
    </FormField>
    <Button type="submit" size="lg">{t("applyFilters")}</Button>
    {canReset ? <Button type="button" variant="outline" size="lg" className="gap-2" onClick={resetFilters}><RotateCcw aria-hidden="true" className="size-4" />{t("resetFilters")}</Button> : null}
    <p className="basis-full text-xs leading-5 text-[var(--ui-text-muted)]">{t("periodHint")}</p>
    {invalidFilters ? <p role="alert" className="basis-full text-sm text-[var(--ui-danger-text)]">{t("invalidFilters")}</p> : null}
  </form>;
}
