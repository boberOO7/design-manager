"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceTripRecognition } from "@/app/(app)/finance/reports/trip-actions";
import { FinanceActionForm } from "@/components/finance/finance-action-form";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FormField, Textarea } from "@/components/ui/form-field";
import { Panel } from "@/components/ui/panel";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import type { TripRecognitionSource } from "@/lib/finance-trip-reporting";
import { formatDateOnly } from "@/lib/utils";

const panel = "min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5";

function amount(value: string | null, code: string, currencies: FinanceCurrency[], locale: string) {
  if (value === null) return "—";
  const currency = currencies.find(item => item.code === code);
  return currency ? formatFinanceAmount(value, currency, locale) : `${value} ${code}`;
}

export function ManagementTripSection({ sources, currencies, projects, onSaved }: {
  sources: TripRecognitionSource[];
  currencies: FinanceCurrency[];
  projects: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const t = useTranslations("Finance.tripReporting"), locale = useLocale();
  const projectNames = new Map(projects.map(project => [project.id, project.name]));

  return <section aria-label={t("title")} className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div><h2 className="text-lg font-semibold">{t("title")}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("help")}</p></div>
      <p className="text-sm text-[var(--ui-text-secondary)]">{t("pendingCount", { count: sources.length })}</p>
    </div>
    <Panel className={`${panel} space-y-2`}>
      <p className="text-sm text-[var(--ui-text-secondary)]">{t("repairHelp")}</p>
      {!sources.length ? <p className="text-sm text-[var(--ui-text-muted)]">{t("empty")}</p> : <ul className="divide-y divide-[var(--ui-border)]">
        {sources.map(source => <li key={source.id} className="py-3">
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <p className="break-words font-medium">{source.description}</p>
              <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{formatDateOnly(source.date, locale)} · {source.projectId ? projectNames.get(source.projectId) ?? t("projectUnavailable") : t("studioCost")}</p>
            </div>
            <div className="text-left tabular-nums sm:text-right">
              <p className="font-semibold">{amount(source.reportingAmount, source.reportingCurrency, currencies, locale)}</p>
              <p className="text-xs text-[var(--ui-text-muted)]">{t("nativeAmount", { amount: amount(source.amount, source.currency, currencies, locale) })}</p>
            </div>
          </div>
          <AnimatedDisclosure title={t("reviewSource", { description: source.description })} className="mt-2">
            <div className="space-y-3 pt-2">
              <p className="text-xs text-[var(--ui-text-secondary)]">{t("confirmationHelp", { description: source.description, date: formatDateOnly(source.date, locale), amount: amount(source.reportingAmount, source.reportingCurrency, currencies, locale) })}</p>
              <Link href={`/finance/trips/${source.tripId}`} className="inline-flex min-h-10 items-center rounded px-1 text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("openTrip")}</Link>
              <FinanceActionForm action={saveFinanceTripRecognition} label={t("confirmSource")} onSaved={onSaved}>
                <input type="hidden" name="entryId" value={source.id}/>
                <FormField label={t("reason")}><Textarea name="reason" rows={2} maxLength={2000} required/></FormField>
              </FinanceActionForm>
            </div>
          </AnimatedDisclosure>
        </li>)}
      </ul>}
    </Panel>
  </section>;
}
