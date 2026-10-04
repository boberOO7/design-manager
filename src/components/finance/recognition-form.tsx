"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceManagementData } from "@/data/queries/finance-management";
import { saveFinanceManagement } from "@/app/(app)/finance/reports/actions";
import { financeAmountUnits } from "@/lib/finance";
import type { RecognitionSource } from "@/lib/finance-management";
import { FinanceActionForm } from "@/components/finance/finance-action-form";
import { FinanceFxFields } from "@/components/finance/finance-fx-fields";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { formatDateOnly } from "@/lib/utils";

function amountDateInSource(source: RecognitionSource | undefined, today: string) {
  if (source?.periodStart && today < source.periodStart) return source.periodStart;
  if (source?.periodEnd && today > source.periodEnd) return source.periodEnd;
  return today;
}

export function RecognitionForm({ data, onSaved, projectId, onPending, projectRevenueOnly = false }: {
  data: FinanceManagementData;
  onSaved: () => void;
  projectId?: string;
  onPending?: (pending: boolean) => void;
  projectRevenueOnly?: boolean;
}) {
  const t = useTranslations("Finance.management"), locale = useLocale();
  const recognitionStart = data.settings?.recognition_start_month ?? null;
  const startMonth = `${data.today.slice(0, 7)}-01`;
  const earliestEntryDate = recognitionStart ?? startMonth;
  const eligibleSources = useMemo(() => getEligibleRecognitionSources(data, { projectId, projectRevenueOnly }),
    [data, projectId, projectRevenueOnly]);
  const [selectedSourceId, setSelectedSourceId] = useState(eligibleSources[0]?.sourceId ?? "");
  const source = eligibleSources.find(item => item.sourceId === selectedSourceId);
  const [sourceAmount, setSourceAmount] = useState(source?.remaining ?? "");
  const [periodStart, setPeriodStart] = useState(source?.periodStart && source.periodStart > earliestEntryDate ? source.periodStart : earliestEntryDate);
  const [periodEnd, setPeriodEnd] = useState(source?.periodEnd && source.periodEnd < data.today ? source.periodEnd : data.today);
  const [recognizedOn, setRecognizedOn] = useState(amountDateInSource(source, data.today));
  const [sourceDescription, setSourceDescription] = useState(source?.label ?? "");
  const [projectForSource, setProjectForSource] = useState(source?.projectId ?? (projectRevenueOnly ? projectId ?? "" : ""));
  const sourceNeedsProject = source?.classification === "direct_cost" && !source.projectId;
  const updateSource = (id: string) => {
    const next = eligibleSources.find(item => item.sourceId === id);
    setSelectedSourceId(id);
    setSourceAmount(next?.remaining ?? "");
    setPeriodStart(next?.periodStart && next.periodStart > earliestEntryDate ? next.periodStart : earliestEntryDate);
    setPeriodEnd(next?.periodEnd && next.periodEnd < data.today ? next.periodEnd : data.today);
    setRecognizedOn(amountDateInSource(next, data.today));
    setSourceDescription(next?.label ?? "");
    setProjectForSource(next?.projectId ?? (projectRevenueOnly ? projectId ?? "" : ""));
  };
  const desktopGrid = projectRevenueOnly ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4";
  const sourceFieldClass = projectRevenueOnly ? "sm:col-span-2" : "sm:col-span-2 xl:col-span-2";
  const descriptionFieldClass = projectRevenueOnly ? "" : "sm:col-span-2 xl:col-span-2";
  const reasonFieldClass = projectRevenueOnly ? "sm:col-span-2" : "sm:col-span-2 xl:col-span-4";
  const fxFieldClass = projectRevenueOnly ? "sm:col-span-2" : "sm:col-span-2 xl:col-span-2";

  if (!recognitionStart) return <p className="text-sm text-[var(--ui-text-secondary)]">{t("activationRequired")}</p>;
  if (recognitionStart > data.today) return <p className="text-sm text-[var(--ui-text-secondary)]">{t("reportUnavailable", { date: formatDateOnly(recognitionStart, locale) })}</p>;
  if (!eligibleSources.length) return <p className="text-sm text-[var(--ui-text-secondary)]">{t("noSources")}</p>;

  return <FinanceActionForm action={saveFinanceManagement} label={t("confirmRecognition")} onSaved={onSaved} onPending={onPending} className="space-y-4" disabled={!source || (sourceNeedsProject && !projectForSource)}>
    <input type="hidden" name="intent" value="recognition"/>
    <input type="hidden" name="sourceKind" value={source?.kind ?? ""}/>
    <input type="hidden" name="sourceId" value={source?.sourceId ?? ""}/>
    <input type="hidden" name="classification" value={source?.classification ?? "revenue"}/>
    <input type="hidden" name="projectId" value={source?.projectId ?? projectForSource}/>
    <div className={`grid min-w-0 gap-3 ${desktopGrid}`}>
      <FormField label={t("source")} className={sourceFieldClass}><Select value={selectedSourceId} onValueChange={updateSource}>{eligibleSources.map(item => <SelectItem key={`${item.kind}-${item.sourceId}`} value={item.sourceId}>{item.label}{projectRevenueOnly ? "" : ` · ${t(`sourceKind.${item.kind}`)}`}</SelectItem>)}</Select></FormField>
      <FormField label={t("netAmount", { currency: source?.currency ?? "" })}><Input name="amount" inputMode="decimal" value={sourceAmount} onChange={event => setSourceAmount(event.target.value)} required autoComplete="off"/><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("recognitionBasisHelp")}</span></FormField>
      <div className="flex items-end text-xs text-[var(--ui-text-secondary)]">{source ? t("sourceValue", { gross: source.gross, remaining: source.remaining, currency: source.currency }) : null}</div>
      {sourceNeedsProject ? <FormField label={t("assignProject")} className="sm:col-span-2"><Select value={projectForSource} onValueChange={setProjectForSource} required><SelectItem value="">{t("selectProject")}</SelectItem>{data.projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</Select></FormField> : null}
      <FormField label={t("economicDate")}><DatePicker name="date" value={recognizedOn} onValueChange={setRecognizedOn} min={periodStart < recognitionStart ? recognitionStart : periodStart} max={periodEnd > data.today ? data.today : periodEnd} locale={locale} required/></FormField>
      <FormField label={t("periodStart")}><DatePicker name="periodStart" value={periodStart} onValueChange={setPeriodStart} min={recognitionStart ?? startMonth} max={data.today} locale={locale} required/></FormField>
      <FormField label={t("periodEnd")}><DatePicker name="periodEnd" value={periodEnd} onValueChange={setPeriodEnd} min={periodStart < recognitionStart ? recognitionStart : periodStart} max={data.today} locale={locale} required/></FormField>
      <FormField label={t("descriptionLabel")} className={descriptionFieldClass}><Input name="description" value={sourceDescription} onChange={event => setSourceDescription(event.target.value)} maxLength={2000} required/></FormField>
      {source && source.currency !== data.settings?.base_currency ? <div className={fxFieldClass}><FinanceFxFields currency={source.currency} base={data.settings?.base_currency ?? "UAH"}/><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("fxSourceHelp")}</p></div> : <input type="hidden" name="fxMode" value="nbu"/>}
      <FormField label={t("reason")} className={reasonFieldClass}><Textarea name="reason" rows={2} maxLength={2000} required/></FormField>
    </div>
    {source ? <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3 text-sm text-[var(--ui-text-secondary)]"><p>{t("confirmation", { amount: sourceAmount || "0", currency: source.currency, date: formatDateOnly(recognizedOn, locale), from: formatDateOnly(periodStart, locale), to: formatDateOnly(periodEnd, locale) })}</p>{(source.projectId || projectForSource) ? <p className="mt-1">{t("projectConfirmed", { project: data.projects.find(project => project.id === (source.projectId ?? projectForSource))?.name ?? "" })}</p> : null}<p className="mt-1">{t("confirmationReason")}</p></div> : null}
  </FinanceActionForm>;
}

export function getEligibleRecognitionSources(data: FinanceManagementData, options: { projectId?: string; projectRevenueOnly?: boolean } = {}) {
  const recognitionStart = data.settings?.recognition_start_month ?? null;
  const earliestEntryDate = recognitionStart ?? `${data.today.slice(0, 7)}-01`;
  return data.sources.filter(source => (!recognitionStart || recognitionStart <= data.today)
    && financeAmountUnits(source.remaining, 4) > BigInt(0)
    && (!source.periodEnd || source.periodEnd >= earliestEntryDate)
    && (!source.periodStart || source.periodStart <= data.today)
    && (!options.projectRevenueOnly || (source.classification === "revenue" && source.projectId === options.projectId)));
}
