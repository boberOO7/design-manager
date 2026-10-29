"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, CalendarDays, Calculator, UserRound, Wallet } from "lucide-react";
import type { getFinanceData } from "@/data/queries/finance";
import type { PayrollPayment, PayrollPeriod } from "@/lib/finance-payroll-earnings";
import { loadFinancePayrollCash, loadFinancePayrollPayment, recordFinancePayrollAdvance, recordFinancePayrollPayment } from "@/app/(app)/finance/schedules/payroll-actions";
import { quoteFinanceSettlement } from "@/app/(app)/finance/movements/actions";
import { indicativeFinanceConversion } from "@/lib/finance-fx-preview";
import { formatFinanceDecimal } from "@/lib/finance";
import { formatDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { FinanceActionForm } from "./finance-action-form";

type CashAccounts = Pick<NonNullable<Awaited<ReturnType<typeof getFinanceData>>>, "accounts">;

function PayrollRateFields({ mode, manualRate, onModeChange, onRateChange }: {
  mode: "nbu" | "manual"; manualRate: string; onModeChange: (mode: "nbu" | "manual") => void; onRateChange: (rate: string) => void;
}) {
  const t = useTranslations("Finance.payrollCash"), financeT = useTranslations("Finance");
  return <>
    <FormField className="w-40 max-w-full" label={t("rateSource")}><Select name="mode" value={mode} onValueChange={value => onModeChange(value === "manual" ? "manual" : "nbu")} aria-label={t("rateSource")}><SelectItem value="nbu">{financeT("movements.nbuShort")}</SelectItem><SelectItem value="manual">{financeT("movements.manualShort")}</SelectItem></Select></FormField>
    {mode === "manual" ? <FormField className="w-40 max-w-full" label={t("rate")}><Input name="manualRate" aria-label={t("rate")} inputMode="decimal" value={manualRate} onChange={event => onRateChange(event.target.value)} required /></FormField> : <input type="hidden" name="manualRate" value="" />}
  </>;
}

export function PayrollPaymentForm({ accounts, today, itemId, initial, period, onSaved, onPending, onReviewCalculation }: CashAccounts & { today: string; itemId: string; initial?: PayrollPayment; period?: PayrollPeriod; onReviewCalculation?: () => void; onSaved: () => void; onPending: (pending: boolean) => void }) {
  const t = useTranslations("Finance.payrollCash"), financeT = useTranslations("Finance"), locale = useLocale();
  const [date, setDate] = useState(today), [mode, setMode] = useState<"nbu" | "manual">("nbu"), [manualRate, setManualRate] = useState("");
  const [quote, setQuote] = useState<{ key: string; value: PayrollPayment | null }>({ key: `${today}:nbu:`, value: initial ?? null });
  const [error, setError] = useState(false), [amount, setAmount] = useState(initial?.cashDue ?? ""), [edited, setEdited] = useState(false);
  const needsConfirmation = Boolean(period?.current.payMethod === "per_m2" && !period.confirmed);
  const active = accounts.filter(account => !account.archived_at && account.currency === "UAH");
  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [reload, setReload] = useState(0);
  const key = `${date}:${mode}:${manualRate}`, preview = quote.key === key ? quote.value : null;
  const salaryCurrency = quote.value?.currency ?? initial?.currency ?? period?.current.currency;
  const money = (value: string | null, currency = "UAH") => value === null ? "—" : `${formatFinanceDecimal(value, locale, { maximumFractionDigits: 2 })} ${currency}`;
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setError(false);
      loadFinancePayrollPayment(itemId, date, mode, manualRate).then(value => {
        if (current) { setQuote({ key: `${date}:${mode}:${manualRate}`, value }); setError(!value); }
      }).catch(() => { if (current) setError(true); });
    }, mode === "manual" ? 180 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [itemId, date, mode, manualRate, reload]);
  useEffect(() => { if (!edited && preview) setAmount(preview.cashDue ?? ""); }, [preview, edited]);
  const enteredAmount = amount.trim().replace(",", ".");
  const amountErrorId = useId();
  const amountError = edited && enteredAmount && preview && preview.cashDue !== null ? (
    !/^\d+(?:\.\d{1,2})?$/.test(enteredAmount) ? t("invalidAmount") :
    Number(enteredAmount) > Number(preview.cashDue) ? t("amountLimit", { amount: money(preview.cashDue) }) :
    Number(enteredAmount) === 0 && Number(preview.advanceUsed) === 0 ? t("positiveAmount") : null
  ) : null;
  const ready = Boolean(!error && preview?.rate && preview.totalUah && Number(preview.remaining) > 0 && /^\d+(?:\.\d{1,2})?$/.test(enteredAmount) && Number(enteredAmount) <= Number(preview.cashDue) && (Number(enteredAmount) === 0 ? Number(preview.advanceUsed) > 0 : accountId));
  return <FinanceActionForm action={recordFinancePayrollPayment} label={t(enteredAmount !== "" && Number(enteredAmount) === 0 ? "applyAdvance" : "pay")} disabled={!ready} secondaryAction={onReviewCalculation ? <Button type="button" variant="ghost" className="gap-2" aria-label={financeT("payrollEarning.open")} onClick={onReviewCalculation}><Calculator aria-hidden="true" className="size-4" />{financeT("payrollEarning.calculation")}</Button> : undefined}
    onResult={result => { if (result.status === "error") setReload(value => value + 1); }} onPending={onPending} onSaved={onSaved}>
    <input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="digest" value={preview?.digest ?? ""} />
    {needsConfirmation && period ? <input type="hidden" name="earningDigest" value={period.current.digest} /> : null}
    <input type="hidden" name="note" value={t("paymentDescription")} />
    <div className="space-y-1">
      <p className="font-semibold">{preview?.employeeName ?? initial?.employeeName ?? period?.employeeName}</p>
      {period ? <p className="flex items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><CalendarDays aria-hidden="true" className="size-4 shrink-0" />{formatDateOnly(period.periodStart, locale)} – {formatDateOnly(period.periodEnd, locale)}</p> : null}
    </div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
      <FormField className="min-w-0" label={financeT("movements.account")}><Select name="accountId" value={accountId} onValueChange={setAccountId} aria-label={financeT("movements.account")} required={Number(amount) > 0}><SelectItem value="">{t("chooseAccount")}</SelectItem>{active.map(account => <SelectItem key={account.id} value={account.id}>{account.name} · UAH</SelectItem>)}</Select></FormField>
      <FormField className="w-44" label={financeT("movements.date")}><DatePicker name="date" value={date} onValueChange={value => { setDate(value); setEdited(false); }} max={today} locale={locale} required /></FormField>
    </div>
    <section aria-label={t("cashAmount")} className="space-y-4 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-4">
      {preview ? <dl className="space-y-2 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><dt className="flex items-center gap-2 text-[var(--ui-text-secondary)]"><Wallet aria-hidden="true" className="size-4 shrink-0" />{financeT("payrollEarning.remaining")}</dt><dd className="font-semibold tabular-nums">{money(preview.remaining, preview.currency)}</dd></div>
        {Number(preview.advanceUsed) > 0 ? <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><dt className="text-[var(--ui-text-secondary)]">{t("advanceUsed")}</dt><dd className="font-medium tabular-nums">−{money(preview.advanceUsed, preview.currency)}</dd></div> : null}
      </dl> : null}
      <div className="flex flex-wrap items-end gap-3">
        <FormField className="w-32 max-w-full sm:w-40" label={t("cashAmount")}><Input className="text-lg font-semibold tabular-nums" name="amount" aria-label={t("cashAmount")} aria-invalid={Boolean(amountError)} aria-describedby={amountError ? amountErrorId : undefined} value={amount} onChange={event => { setAmount(event.target.value); setEdited(true); }} inputMode="decimal" required /></FormField>
        {salaryCurrency === "USD" ? <PayrollRateFields mode={mode} manualRate={manualRate} onModeChange={value => { setMode(value); setEdited(false); }} onRateChange={value => { setManualRate(value); setEdited(false); }} /> : <><input type="hidden" name="mode" value="nbu" /><input type="hidden" name="manualRate" value="" /></>}
      </div>
      {preview?.rate && salaryCurrency === "USD" ? <p className="flex items-start gap-2 text-xs text-[var(--ui-text-secondary)]"><ArrowRightLeft aria-hidden="true" className="size-4 shrink-0" /><span>1 USD = {formatFinanceDecimal(preview.rate, locale, { maximumFractionDigits: 10 })} UAH · {formatDateOnly(date, locale)}</span></p> : null}
    </section>
    {amountError ? <p id={amountErrorId} role="alert" className="text-sm text-[var(--ui-danger-text)]">{amountError}</p> : null}
    {!preview && !error && (mode === "nbu" || manualRate.trim()) ? <p role="status" className="text-xs text-[var(--ui-text-muted)]">{t("loading")}</p> : null}
    {(error || preview && !preview.rate) && (mode === "nbu" || manualRate.trim()) ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("quoteError")}</p> : null}
    {!active.length && Number(enteredAmount) > 0 ? <p role="status" className="text-sm">{t("noUahAccount")}</p> : null}
  </FinanceActionForm>;
}

export function PayrollAdvanceControl({ scheduleId, employeeName, accounts, today }: CashAccounts & { employeeName: string; scheduleId: string; today: string }) {
  const t = useTranslations("Finance.payrollCash"), financeT = useTranslations("Finance"), locale = useLocale(), router = useRouter();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [credit, setCredit] = useState<Awaited<ReturnType<typeof loadFinancePayrollCash>>>(null), [error, setError] = useState(false);
  const [mode, setMode] = useState<"nbu" | "manual">("nbu"), [manualRate, setManualRate] = useState(""), [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{ date: string; rate: string | null } | null>(null);
  const active = accounts.filter(account => !account.archived_at && account.currency === "UAH");
  const [date, setDate] = useState(today), [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [creditDate, setCreditDate] = useState("");
  useEffect(() => {
    if (!open) return;
    let current = true;
    loadFinancePayrollCash(scheduleId, date).then(value => { if (current) { setCredit(value); setCreditDate(date); setError(!value); } }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [scheduleId, open, date]);
  useEffect(() => { let current = true; if (open && credit?.currency === "USD" && mode === "nbu") quoteFinanceSettlement({ currency: "USD", obligationCurrency: "UAH", date }).then(value => { if (current) setQuote({ date, rate: value?.rate ?? null }); }).catch(() => { if (current) setQuote({ date, rate: null }); }); return () => { current = false; }; }, [open, credit?.currency, mode, date]);
  const rate = creditDate !== date ? "" : credit?.currency === "UAH" ? "1" : mode === "manual" ? manualRate.trim().replace(",", ".") : quote?.date === date ? quote.rate : "";
  // Preview only. PostgreSQL calculates and freezes the authoritative currency credit.
  const inverseRate = Number(rate) > 0 ? (1 / Number(rate)).toFixed(10) : "";
  const equivalent = amount && inverseRate ? indicativeFinanceConversion(amount, inverseRate, 2, 2) : null;
  return <>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button type="button" size="sm" variant="outline" onClick={() => { setCredit(null); setCreditDate(""); setError(false); setOpen(true); }}>{t("advance")}</Button>
    </div>
    <Dialog className="h-auto max-h-[calc(100dvh-1rem)] sm:max-w-[40rem]" isOpen={open} onRequestClose={() => setOpen(false)} closeDisabled={pending} title={t("advance")} closeLabel={financeT("payrollEarning.close")}>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6"><FinanceActionForm action={recordFinancePayrollAdvance} label={t("recordAdvance")} disabled={!active.length || !rate || Number(rate) <= 0 || !Number.isFinite(Number(rate)) || !["UAH", "USD"].includes(credit?.currency ?? "")} onPending={setPending} onSaved={() => { setOpen(false); router.refresh(); }}>
        <input type="hidden" name="scheduleId" value={scheduleId} /><input type="hidden" name="currency" value={credit?.currency ?? ""} />
        <div className="space-y-1"><p className="flex items-center gap-2 font-semibold"><UserRound aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-secondary)]" />{employeeName}</p>
          {credit?.balances.filter(balance => Number(balance.available) > 0).map(balance => <p key={balance.currency} className="text-xs text-[var(--ui-text-secondary)]">{t("available", { amount: formatFinanceDecimal(balance.available, locale, { maximumFractionDigits: 2 }), currency: balance.currency })}</p>)}
        </div>
        {error ? <p role="alert" className="text-sm">{t("loadError")}</p> : null}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <FormField className="min-w-0" label={financeT("movements.account")}><Select name="accountId" value={accountId} onValueChange={setAccountId} aria-label={financeT("movements.account")} required>{active.map(account => <SelectItem key={account.id} value={account.id}>{account.name} · UAH</SelectItem>)}</Select></FormField>
          <FormField className="w-44" label={financeT("movements.date")}><DatePicker name="date" value={date} onValueChange={setDate} max={today} locale={locale} required /></FormField>
        </div>
        {!active.length ? <p role="status" className="text-sm">{t("noUahAccount")}</p> : null}
        <section aria-label={t("cashAmount")} className="space-y-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <FormField className="w-32 max-w-full sm:w-40" label={t("cashAmount")}><Input className="text-lg font-semibold tabular-nums" name="amount" aria-label={t("cashAmount")} value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required /></FormField>
            {credit?.currency === "USD" ? <PayrollRateFields mode={mode} manualRate={manualRate} onModeChange={setMode} onRateChange={setManualRate} /> : <><input type="hidden" name="mode" value="nbu" /><input type="hidden" name="manualRate" value="" /></>}
          </div>
          {credit?.currency === "USD" && rate && Number(rate) > 0 ? <p className="flex items-start gap-2 text-xs text-[var(--ui-text-secondary)]"><ArrowRightLeft aria-hidden="true" className="size-4 shrink-0" /><span>1 USD = {formatFinanceDecimal(rate, locale, { maximumFractionDigits: 10 })} UAH · {formatDateOnly(date, locale)}</span></p> : null}
          {credit?.currency === "USD" && mode === "nbu" && !rate ? <p role="status" className="text-xs text-[var(--ui-text-muted)]">{quote?.date === date ? t("quoteError") : t("loading")}</p> : null}
          {equivalent && credit ? <p className="text-sm tabular-nums">{t("creditAmount", { amount: formatFinanceDecimal(equivalent, locale, { maximumFractionDigits: 2 }), currency: credit.currency ?? "" })}</p> : null}
        </section>
      </FinanceActionForm></div>
    </Dialog>
  </>;
}
