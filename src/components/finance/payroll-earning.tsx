"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { confirmFinancePayrollEarning, loadFinancePayrollPeriod } from "@/app/(app)/finance/schedules/payroll-actions";
import type { PayrollPeriod } from "@/lib/finance-payroll-earnings";
import { financeAmountText, financeAmountUnits, formatFinanceDecimal } from "@/lib/finance";
import { instantToDateOnly } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FinanceActionForm } from "./finance-action-form";

import { PayrollAdvanceControl, PayrollPaymentForm } from "./payroll-payment";
import type { FinanceSchedulesData, getFinanceData } from "@/data/queries/finance";
type CashAccounts = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>["accounts"];

function PayrollEarningForm({ period, minorUnits, onSaved, onPending }: { period: PayrollPeriod; minorUnits: number; onSaved: () => void; onPending: (pending: boolean) => void }) {
  const t = useTranslations("Finance.payrollEarning"), financeT = useTranslations("Finance"), locale = useLocale();
  const [refresh, setRefresh] = useState(false);
  const [amount, setAmount] = useState(period.confirmed?.finalAmount ?? period.current.calculatedAmount);
  const basis = refresh ? period.current : period.confirmed?.source ?? period.current;
  const money = (value: string) => `${formatFinanceDecimal(value, locale, { maximumFractionDigits: minorUnits })} ${basis.currency}`;
  let difference: string | null = null;
  try { difference = financeAmountText(financeAmountUnits(amount.replace(",", "."), minorUnits) - financeAmountUnits(basis.calculatedAmount, minorUnits), minorUnits); } catch { /* Input may be incomplete while typing. */ }
  const payout = period.confirmed?.payout;
  const balance = payout === undefined ? null : financeAmountUnits(payout, minorUnits) - financeAmountUnits(period.paid, minorUnits);
  return <FinanceActionForm action={confirmFinancePayrollEarning} label={t(period.confirmed ? "saveCorrection" : "confirm")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="obligationId" value={period.obligationId} /><input type="hidden" name="revision" value={period.confirmed?.revision ?? 0} />
    <input type="hidden" name="digest" value={period.current.digest} /><input type="hidden" name="refreshSource" value={String(refresh)} />
    <p className="text-sm text-[var(--ui-text-secondary)]">{period.employeeName} · {formatDateOnly(period.periodStart, locale)} – {formatDateOnly(period.periodEnd, locale)}</p>
    <p className="text-sm">{t(period.confirmed ? "confirmed" : "preliminary")}</p>
    {period.sourceChanged ? <div role="status" className="space-y-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3 text-sm">
      <p>{t("sourceChanged", { area: formatFinanceDecimal(period.current.area, locale, { maximumFractionDigits: 4 }), amount: money(period.current.calculatedAmount) })}</p>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={refresh} onChange={event => { setRefresh(event.target.checked); setAmount(event.target.checked ? period.current.calculatedAmount : period.confirmed?.finalAmount ?? period.current.calculatedAmount); }} />{t("refreshSource")}</label>
    </div> : null}
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {basis.payMethod === "per_m2" ? <><div><dt className="text-[var(--ui-text-muted)]">{t("area")}</dt><dd className="tabular-nums">{formatFinanceDecimal(basis.area, locale, { maximumFractionDigits: 4 })} {t("unit")}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("rate")}</dt><dd className="tabular-nums">{basis.rate === null ? "—" : formatFinanceDecimal(basis.rate, locale, { maximumFractionDigits: 4 })} {basis.currency}/{t("unit")}</dd></div></> : null}
      <div><dt className="text-[var(--ui-text-muted)]">{t("calculated")}</dt><dd className="tabular-nums">{money(basis.calculatedAmount)} · {financeT(`schedules.${basis.basis}`)}</dd></div>
      <div><dt className="text-[var(--ui-text-muted)]">{t("paid")}</dt><dd className="tabular-nums">{money(period.paid)}</dd></div>
      {balance !== null ? <div><dt className="text-[var(--ui-text-muted)]">{t(balance < BigInt(0) ? "overpaid" : "remaining")}</dt><dd className="tabular-nums">{money(financeAmountText(balance < BigInt(0) ? -balance : balance, minorUnits))}</dd></div> : null}
    </dl>
    <FormField label={`${t("finalAmount")} · ${financeT(`schedules.${basis.basis}`)}`}><Input name="finalAmount" aria-label={`${t("finalAmount")} · ${financeT(`schedules.${basis.basis}`)}`} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required /></FormField>
    {difference !== null ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("adjustment")}: {money(difference)}</p> : null}
    <FormField label={t("reason")}><Textarea name="reason" aria-label={t("reason")} rows={2} maxLength={2000} required /></FormField>
    <p className="text-xs text-[var(--ui-text-muted)]">{t("snapshotHelp")}</p>
    {basis.sources.length ? <AnimatedDisclosure title={t("sources")}><ul className="space-y-2 text-sm">{basis.sources.map(source => <li key={source.id} className="flex flex-wrap justify-between gap-x-4"><span>{source.projectName ?? t("deletedProject")} · {source.taskTitle ?? t("projectWork")}</span><span className="tabular-nums">{formatFinanceDecimal(source.area, locale, { maximumFractionDigits: 4 })} {t("unit")} · {formatDateOnly(instantToDateOnly(source.completedAt), locale)}</span></li>)}</ul></AnimatedDisclosure> : null}
    {period.history.length ? <AnimatedDisclosure title={t("history")}><ol className="space-y-3 text-sm">{period.history.map(revision => <li key={revision.revision}><p className="font-medium">{t("revision", { revision: revision.revision })} · {money(revision.finalAmount)}</p><p className="text-[var(--ui-text-secondary)]">{revision.reason} · {formatDateOnly(instantToDateOnly(revision.createdAt), locale)}</p></li>)}</ol></AnimatedDisclosure> : null}
  </FinanceActionForm>;
}

export function PayrollEarningDialog({ obligationId, currencies, accounts, today, onClose }: { accounts?: CashAccounts; today?: string; obligationId: string | null; currencies: ReadonlyArray<{ code: string; minor_units: number }>; onClose: () => void }) {
  const t = useTranslations("Finance.payrollEarning"), router = useRouter();
  const [paying, setPaying] = useState(false);
  const [period, setPeriod] = useState<PayrollPeriod | null>(null), [error, setError] = useState(false), [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    if (obligationId) loadFinancePayrollPeriod(obligationId).then(value => { if (active) { setPeriod(value); setError(!value); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [obligationId]);
  const loaded = period?.obligationId === obligationId ? period : null;
  return <Dialog isOpen={Boolean(obligationId)} onRequestClose={onClose} closeDisabled={pending} title={t("title")} closeLabel={t("close")}>
    <div className="min-h-0 overflow-y-auto p-4 sm:p-6">{paying && loaded?.expectedItemId && accounts && today ? <><Button type="button" variant="ghost" size="sm" className="mb-3" disabled={pending} onClick={() => setPaying(false)}>{t("backToCalculation")}</Button><PayrollPaymentForm accounts={accounts} today={today} itemId={loaded.expectedItemId} onPending={setPending} onSaved={() => { onClose(); router.refresh(); }} /></> : error ? <p role="alert">{t("loadError")}</p> : loaded ? <>{accounts && today && loaded.confirmed && loaded.expectedItemId && Number(loaded.confirmed.payout) > Number(loaded.paid) && ["UAH", "USD"].includes(loaded.current.currency) ? <Button type="button" className="mb-4" onClick={() => setPaying(true)}>{t("pay")}</Button> : null}<PayrollEarningForm key={loaded.obligationId} period={loaded} minorUnits={currencies.find(currency => currency.code === loaded.current.currency)?.minor_units ?? 2} onPending={setPending} onSaved={() => { onClose(); router.refresh(); }} /></> : <p role="status">{t("loading")}</p>}</div>
  </Dialog>;
}

export function PayrollPeriods({ scheduleId, employeeName, periods, currencies, accounts, today }: { periods: FinanceSchedulesData["payrollPeriods"]; employeeName: string; accounts: CashAccounts; today: string; scheduleId: string; currencies: ReadonlyArray<{ code: string; minor_units: number }> }) {
  const t = useTranslations("Finance.payrollEarning"), locale = useLocale();
  const [selectedId, setSelected] = useState(periods[0]?.id ?? "");
  const selected = periods.some(period => period.id === selectedId) ? selectedId : periods[0]?.id ?? "";
  const [editing, setEditing] = useState<string | null>(null);
  return <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
    {periods.length ? <div className="flex flex-wrap items-end gap-2"><FormField label={t("month")}><Select size="compact" width="content" value={selected} onValueChange={setSelected} aria-label={t("month")}>{periods.map(period => <SelectItem key={period.id} value={period.id}>{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.period_start}T00:00:00Z`))}</SelectItem>)}</Select></FormField><Button type="button" size="sm" variant="outline" onClick={() => setEditing(selected)}>{t("open")}</Button></div> : <p className="text-sm text-[var(--ui-text-muted)]">{t("futureUnknown")}</p>}
    <PayrollAdvanceControl employeeName={employeeName} scheduleId={scheduleId} accounts={accounts} today={today} />
    <PayrollEarningDialog accounts={accounts} today={today} key={editing} obligationId={editing} currencies={currencies} onClose={() => setEditing(null)} />
  </div>;
}
