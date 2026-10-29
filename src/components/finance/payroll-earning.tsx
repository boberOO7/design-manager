"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, CalendarDays, Calculator, CircleCheck, Clock3, Info, Ruler, Wallet } from "lucide-react";
import { confirmFinancePayrollEarning, loadFinancePayrollPeriod } from "@/app/(app)/finance/schedules/payroll-actions";
import type { PayrollPeriod } from "@/lib/finance-payroll-earnings";
import { financeAmountText, financeAmountUnits, formatFinanceDecimal } from "@/lib/finance";
import { instantToDateOnly } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AutoResizeTextarea as Textarea } from "@/components/ui/auto-resize-textarea";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FinanceActionForm } from "./finance-action-form";

import { PayrollAdvanceControl, PayrollPaymentForm } from "./payroll-payment";
import type { FinanceSchedulesData, getFinanceData } from "@/data/queries/finance";
type CashAccounts = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>["accounts"];

function PayrollEarningForm({ period, minorUnits, onSaved, onPending, onPay }: { period: PayrollPeriod; minorUnits: number; onSaved: () => void; onPending: (pending: boolean) => void; onPay?: () => void }) {
  const t = useTranslations("Finance.payrollEarning"), financeT = useTranslations("Finance"), locale = useLocale();
  const [refresh, setRefresh] = useState(false);
  const [amount, setAmount] = useState(period.confirmed?.finalAmount ?? period.current.calculatedAmount);
  const basis = refresh ? period.current : period.confirmed?.source ?? period.current;
  const money = (value: string) => `${formatFinanceDecimal(value, locale, { maximumFractionDigits: minorUnits })} ${basis.currency}`;
  let difference: string | null = null;
  try { difference = financeAmountText(financeAmountUnits(amount.replace(",", "."), minorUnits) - financeAmountUnits(basis.calculatedAmount, minorUnits), minorUnits); } catch { /* Input may be incomplete while typing. */ }
  const needsReason = Boolean(period.confirmed || difference !== null && Number(difference) !== 0);
  const payout = period.confirmed?.payout;
  const balance = payout === undefined ? null : financeAmountUnits(payout, minorUnits) - financeAmountUnits(period.paid, minorUnits);
  return <FinanceActionForm action={confirmFinancePayrollEarning} label={t(period.confirmed ? "saveCorrection" : "confirm")} onSaved={onSaved} onPending={onPending} fieldsetClassName="min-w-0 space-y-5">
    <input type="hidden" name="obligationId" value={period.obligationId} /><input type="hidden" name="revision" value={period.confirmed?.revision ?? 0} />
    <input type="hidden" name="digest" value={period.current.digest} /><input type="hidden" name="refreshSource" value={String(refresh)} />
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-[var(--ui-text)]">{period.employeeName}</p>
        <p className="flex items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><CalendarDays aria-hidden="true" className="size-4 shrink-0" />{formatDateOnly(period.periodStart, locale)} – {formatDateOnly(period.periodEnd, locale)}</p>
      </div>
      {onPay ? <Button type="button" variant="ghost" className="gap-2" onClick={onPay}><Wallet aria-hidden="true" className="size-4" />{t("toPayment")}<ArrowRight aria-hidden="true" className="size-4" /></Button> : null}
    </div>
    {period.sourceChanged ? <div role="status" className="space-y-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3 text-sm">
      <p>{t("sourceChanged", { area: formatFinanceDecimal(period.current.area, locale, { maximumFractionDigits: 4 }), amount: money(period.current.calculatedAmount) })}</p>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={refresh} onChange={event => { setRefresh(event.target.checked); setAmount(event.target.checked ? period.current.calculatedAmount : period.confirmed?.finalAmount ?? period.current.calculatedAmount); }} />{t("refreshSource")}</label>
    </div> : null}
    <section aria-label={t("calculated")} className="space-y-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="flex items-center gap-2 text-sm font-medium"><Calculator aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-secondary)]" />{t("calculated")}</h3>
        <span className="flex items-center gap-1.5 text-xs text-[var(--ui-text-secondary)]">{period.confirmed ? <CircleCheck aria-hidden="true" className="size-3.5" /> : <Clock3 aria-hidden="true" className="size-3.5" />}{t(period.confirmed ? "confirmed" : "preliminary")}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="text-2xl font-semibold tabular-nums text-[var(--ui-text)]">{money(basis.calculatedAmount)}</p><span className="text-sm text-[var(--ui-text-secondary)]">{financeT(`schedules.${basis.basis}`)}</span></div>
      {basis.payMethod === "per_m2" ? <p className="flex items-center gap-2 text-sm tabular-nums text-[var(--ui-text-secondary)]"><Ruler aria-hidden="true" className="size-4 shrink-0" /><span><span><span className="sr-only">{t("area")}: </span>{formatFinanceDecimal(basis.area, locale, { maximumFractionDigits: 4 })} {t("unit")}</span> × <span><span className="sr-only">{t("rate")}: </span>{basis.rate === null ? "—" : formatFinanceDecimal(basis.rate, locale, { maximumFractionDigits: 4 })} {basis.currency}/{t("unit")}</span></span></p> : null}
      <dl className="space-y-2 border-t border-[var(--ui-border)] pt-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><dt className="text-[var(--ui-text-secondary)]">{t("paid")}</dt><dd className="font-medium tabular-nums">{money(period.paid)}</dd></div>
        {balance !== null ? <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><dt className="text-[var(--ui-text-secondary)]">{t(balance < BigInt(0) ? "overpaid" : "remaining")}</dt><dd className="font-medium tabular-nums">{money(financeAmountText(balance < BigInt(0) ? -balance : balance, minorUnits))}</dd></div> : null}
      </dl>
    </section>
    <FormField className="max-w-64" label={`${t("finalAmount")} · ${basis.currency}`}><Input name="finalAmount" aria-label={`${t("finalAmount")} · ${basis.currency}`} className="max-w-44" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required /></FormField>
    {difference !== null && Number(difference) !== 0 ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("adjustment")}: {money(difference)}</p> : null}
    {needsReason ? <FormField label={t("correctionReason")}><Textarea name="reason" aria-label={t("correctionReason")} rows={1} maxLength={2000} required /></FormField> : <input type="hidden" name="reason" value={t("defaultReason")} />}
    {basis.sources.length ? <AnimatedDisclosure title={t("sources")}><ul className="space-y-2 text-sm">{basis.sources.map(source => <li key={source.id} className="flex flex-wrap justify-between gap-x-4"><span>{source.projectName ?? t("deletedProject")} · {source.taskTitle ?? t("projectWork")}</span><span className="tabular-nums">{formatFinanceDecimal(source.area, locale, { maximumFractionDigits: 4 })} {t("unit")} · {formatDateOnly(instantToDateOnly(source.completedAt), locale)}</span></li>)}</ul></AnimatedDisclosure> : null}
    {period.history.length ? <AnimatedDisclosure title={t("history")}><ol className="space-y-3 text-sm">{period.history.map(revision => <li key={revision.revision}><p className="font-medium">{t("revision", { revision: revision.revision })} · {money(revision.finalAmount)}</p><p className="text-[var(--ui-text-secondary)]">{revision.reason} · {formatDateOnly(instantToDateOnly(revision.createdAt), locale)}</p></li>)}</ol></AnimatedDisclosure> : null}
    <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--ui-text-secondary)]"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t("confirmationHelp")}</p>
  </FinanceActionForm>;
}

export function PayrollEarningDialog({ obligationId, currencies, accounts, today, startWithPayment = false, onClose }: { accounts?: CashAccounts; today?: string; startWithPayment?: boolean; obligationId: string | null; currencies: ReadonlyArray<{ code: string; minor_units: number }>; onClose: () => void }) {
  const t = useTranslations("Finance.payrollEarning"), router = useRouter();
  const [paying, setPaying] = useState(startWithPayment), [reload, setReload] = useState(0);
  const [period, setPeriod] = useState<PayrollPeriod | null>(null), [error, setError] = useState(false), [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    if (obligationId) loadFinancePayrollPeriod(obligationId).then(value => { if (active) { setPeriod(value); setError(!value); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [obligationId, reload]);
  const loaded = period?.obligationId === obligationId ? period : null;
  const supportsPayment = Boolean(accounts && today && loaded?.expectedItemId && ["UAH", "USD"].includes(loaded.current.currency));
  const paymentOpen = paying && supportsPayment && loaded;
  return <Dialog className="h-auto max-h-[calc(100dvh-1rem)] sm:max-w-[40rem]" isOpen={Boolean(obligationId)} onRequestClose={onClose} closeDisabled={pending} title={t(paymentOpen ? "pay" : "title")} closeLabel={t("close")}>
    <div className="min-h-0 overflow-y-auto p-4 sm:p-6">{paymentOpen && loaded.expectedItemId && accounts && today ? <><PayrollPaymentForm accounts={accounts} today={today} itemId={loaded.expectedItemId} period={loaded} onReviewCalculation={() => setPaying(false)} onPending={setPending} onSaved={() => { onClose(); router.refresh(); }} /></> : error ? <p role="alert">{t("loadError")}</p> : loaded ? <><PayrollEarningForm key={loaded.obligationId} onPay={supportsPayment && (!loaded.confirmed || Number(loaded.confirmed.payout) > Number(loaded.paid)) ? () => setPaying(true) : undefined} period={loaded} minorUnits={currencies.find(currency => currency.code === loaded.current.currency)?.minor_units ?? 2} onPending={setPending} onSaved={() => {
      if (!loaded.confirmed && supportsPayment) {
        setPeriod(null); setError(false); setPaying(true); setReload(value => value + 1);
      } else onClose();
      router.refresh();
    }} /></> : <p role="status">{t("loading")}</p>}</div>
  </Dialog>;
}

export function PayrollPeriods({ scheduleId, employeeName, periods, currencies, accounts, today }: { periods: FinanceSchedulesData["payrollPeriods"]; employeeName: string; accounts: CashAccounts; today: string; scheduleId: string; currencies: ReadonlyArray<{ code: string; minor_units: number }> }) {
  const t = useTranslations("Finance.payrollEarning"), locale = useLocale();
  const [selectedId, setSelected] = useState(periods[0]?.id ?? "");
  const selected = periods.some(period => period.id === selectedId) ? selectedId : periods[0]?.id ?? "";
  const [editing, setEditing] = useState<string | null>(null);
  return <div className="mt-3 flex flex-wrap items-end gap-2">
    {periods.length ? <><FormField label={t("month")}><Select size="compact" width="content" value={selected} onValueChange={setSelected} aria-label={t("month")}>{periods.map(period => <SelectItem key={period.id} value={period.id}>{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.period_start}T00:00:00Z`))}</SelectItem>)}</Select></FormField><Button type="button" size="sm" variant="outline" onClick={() => setEditing(selected)}>{t("open")}</Button></> : <p className="text-sm text-[var(--ui-text-muted)]">{t("futureUnknown")}</p>}
    <PayrollAdvanceControl employeeName={employeeName} scheduleId={scheduleId} accounts={accounts} today={today} />
    <PayrollEarningDialog accounts={accounts} today={today} key={editing} obligationId={editing} currencies={currencies} onClose={() => setEditing(null)} />
  </div>;
}
