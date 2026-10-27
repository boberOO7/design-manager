"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { confirmExpenseReceipt, loadExpenseSource } from "@/app/(app)/finance/expenses/actions";
import type { ExpenseSourceInfo } from "@/lib/finance-expenses";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { DatePicker } from "@/components/ui/date-picker";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceFxFields } from "./finance-fx-fields";
import { formatDateOnly } from "@/lib/utils";

export function ExpenseReceiptControl({ kind, sourceId, baseCurrency, today }: { kind: "expected" | "movement"; sourceId: string; baseCurrency: string; today: string }) {
  const t = useTranslations("Finance.expenses"), locale = useLocale(), router = useRouter();
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(false);
  const [info, setInfo] = useState<ExpenseSourceInfo | null>(null), [date, setDate] = useState(""), [confirmed, setConfirmed] = useState(false), [approve, setApprove] = useState(false);
  const load = async () => {
    setLoading(true); setError(false);
    try { const data = await loadExpenseSource(kind, sourceId); setInfo(data); setConfirmed(false); setApprove(false); if (!data) setError(true); }
    catch { setError(true); }
    finally { setLoading(false); }
  };
  return <AnimatedDisclosure title={t("receiptTitle")} open={open} onOpenChange={value => { setOpen(value); if (value && !loading) void load(); }}>
    <div className="space-y-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
      {loading ? <p role="status">{t("loading")}</p> : error ? <><p role="alert">{t("errors.save")}</p><Button type="button" variant="outline" size="sm" onClick={() => void load()}>{t("retry")}</Button></> : info?.receipt ? <>
        <p>{t("receiptRecorded", { date: formatDateOnly(info.receipt.occurred_on, locale) })}</p>
        {info.entries.some(entry => entry.reportingAmount === null) ? <p className="text-[var(--ui-warning-text)]">{t("missingFx")}</p> : null}
        {info.entries.some(entry => entry.kind !== "recognition") ? <p className="text-[var(--ui-text-secondary)]">{t("receiptCorrected")}</p> : null}
        <Link href="/finance/reports#fx-history" className="inline-flex min-h-11 items-center underline underline-offset-2">{t("openHistory")}</Link>
      </>
        : !info?.source ? <p className="text-[var(--ui-warning-text)]">{t("errors.source_unavailable")}</p>
        : info.source.scheduleId ? <p>{t("recurringPayment")} <Link href={`/finance/schedules?expense=${info.source.scheduleId}`} className="underline">{t("openSchedules")}</Link></p>
        : Number(info.source.consumed) !== 0 ? <p className="text-[var(--ui-warning-text)]">{t("errors.manual_history")} <Link href="/finance/reports" className="underline">{t("openHistory")}</Link></p>
        : <FinanceActionForm action={confirmExpenseReceipt} label={t("confirmReceived")} disabled={!confirmed || !date} onSaved={() => { void load(); router.refresh(); }}>
          <input type="hidden" name="kind" value={kind}/><input type="hidden" name="sourceId" value={sourceId}/><input type="hidden" name="version" value={info.source.version}/>
          <input type="hidden" name="projectId" value={info.source.projectId ?? ""}/><input type="hidden" name="approveReviewed" value={String(approve)}/>
          {confirmed ? <input type="hidden" name="confirmed" value="true"/> : null}
          <p className="text-[var(--ui-text-secondary)]">{t("receiptHelp")}</p>
          <p className="tabular-nums">{t("netCost", { amount: info.source.amount, currency: info.source.currency })}</p>
          <FormField label={t("actualDate")}><DatePicker name="date" value={date} onValueChange={value => { setDate(value); setConfirmed(false); setApprove(false); }} max={today} locale={locale} required/></FormField>
          <FinanceFxFields currency={info.source.currency} base={baseCurrency}/>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required/><span>{t("receiptConfirmation")}</span></label>
          <AnimatedDisclosure title={t("reviewedOptions")}><label className="flex items-start gap-2 py-2"><input type="checkbox" className="mt-1" checked={approve} onChange={event => setApprove(event.target.checked)}/><span>{t("approveReviewed")}</span></label></AnimatedDisclosure>
        </FinanceActionForm>}
    </div>
  </AnimatedDisclosure>;
}
