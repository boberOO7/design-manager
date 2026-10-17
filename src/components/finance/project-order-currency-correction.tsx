"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { correctFinanceProjectOrderCurrency } from "@/app/(app)/finance/project-orders/actions";
import type { FinanceProjectData } from "@/data/queries/finance";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { FormField, Textarea } from "@/components/ui/form-field";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";

export function ProjectOrderCurrencyCorrection({ project, order, term, currencies, reportingCurrency, onSaved, onCancel, onPending }: {
  project: FinanceProjectData; order: FinanceProjectData["orders"][number]; term: FinanceProjectData["terms"][number];
  currencies: FinanceCurrency[]; reportingCurrency: string; onSaved: () => void; onCancel: () => void; onPending: (pending: boolean) => void;
}) {
  const t = useTranslations("Finance.currencyCorrection"), locale = useLocale();
  const [currency, setCurrency] = useState(term.currency ?? ""), [confirmed, setConfirmed] = useState(false);
  const money = (amount: number | null, code: string | null) => {
    const unit = currencies.find(item => item.code === code);
    return amount === null || !unit ? "—" : formatFinanceAmount(amount, unit, locale);
  };
  const known = project.planItems.filter(item => item.order_id === order.id).map(item => ({ id: item.id, version: item.version }));
  return <FinanceActionForm action={correctFinanceProjectOrderCurrency} label={t("save")} cancelLabel={t("cancel")} onCancel={onCancel} onSaved={onSaved} onPending={onPending} disabled={currency === term.currency || !confirmed} className="p-4 sm:p-6">
    <input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="orderId" value={order.id}/>
    <input type="hidden" name="version" value={order.version}/><input type="hidden" name="termsId" value={term.id ?? ""}/><input type="hidden" name="known" value={JSON.stringify(known)}/>
    <p className="text-sm leading-6 text-[var(--ui-text-secondary)]">{t("help")}</p>
    <FormField label={t("currency")}><FinanceCurrencySelect name="currency" aria-label={t("currency")} currencies={currencies} reportingCurrency={reportingCurrency} value={currency} onValueChange={value => { setCurrency(value); setConfirmed(false); }}/></FormField>
    <div className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-4" aria-live="polite">
      <p className="mb-2 text-xs text-[var(--ui-text-secondary)]">{t("nominal")}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-semibold tabular-nums"><span>{money(term.amount, term.currency)}</span><ArrowRight aria-label={t("becomes")} className="size-4 text-[var(--ui-text-muted)]"/><span>{money(term.amount, currency)}</span></div>
      <p className="mt-2 text-xs leading-5 text-[var(--ui-text-secondary)]">{t("clientTotal", { before: money(term.gross_amount, term.currency), after: money(term.gross_amount, currency) })}</p>
    </div>
    <p className="text-sm leading-6 text-[var(--ui-text-secondary)]">{t("impact")}</p>
    <FormField label={t("reason")}><Textarea name="reason" aria-label={t("reason")} required maxLength={2000} rows={2}/></FormField>
    <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm leading-6"><input type="checkbox" name="confirmed" className="mt-1.5 shrink-0 accent-[var(--ui-action-primary)]" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{t("confirm")}</span></label>
    <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("history")}</p>
  </FinanceActionForm>;
}
