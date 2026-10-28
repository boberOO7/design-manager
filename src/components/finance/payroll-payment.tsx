"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { getFinanceData } from "@/data/queries/finance";
import type { PayrollPayment } from "@/lib/finance-payroll-earnings";
import { loadFinancePayrollCash, loadFinancePayrollPayment, recordFinancePayrollAdvance, recordFinancePayrollPayment } from "@/app/(app)/finance/schedules/payroll-actions";
import { quoteFinanceSettlement } from "@/app/(app)/finance/movements/actions";
import { indicativeFinanceConversion } from "@/lib/finance-fx-preview";
import { formatFinanceDecimal } from "@/lib/finance";
import { formatDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { FinanceActionForm } from "./finance-action-form";

type CashAccounts = Pick<NonNullable<Awaited<ReturnType<typeof getFinanceData>>>, "accounts">;

export function PayrollPaymentForm({ accounts, today, itemId, initial, onSaved, onPending }: CashAccounts & { today: string; itemId: string; initial?: PayrollPayment; onSaved: () => void; onPending: (pending: boolean) => void }) {
  const t = useTranslations("Finance.payrollCash"), financeT = useTranslations("Finance"), locale = useLocale();
  const [date, setDate] = useState(today), [mode, setMode] = useState<"nbu" | "manual">("nbu"), [manualRate, setManualRate] = useState("");
  const [quote, setQuote] = useState<{ key: string; value: PayrollPayment | null }>({ key: `${today}:nbu:`, value: initial ?? null });
  const [error, setError] = useState(false), [amount, setAmount] = useState(initial?.cashDue ?? ""), [edited, setEdited] = useState(false);
  const active = accounts.filter(account => !account.archived_at && account.currency === "UAH");
  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [reload, setReload] = useState(0);
  const key = `${date}:${mode}:${manualRate}`, preview = quote.key === key ? quote.value : null;
  const salaryCurrency = quote.value?.currency ?? initial?.currency;
  const money = (value: string | null, currency = "UAH") => value === null ? "—" : `${formatFinanceDecimal(value, locale, { maximumFractionDigits: 2 })} ${currency}`;
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      loadFinancePayrollPayment(itemId, date, mode, manualRate).then(value => {
        if (current) { setQuote({ key: `${date}:${mode}:${manualRate}`, value }); setError(!value); }
      }).catch(() => { if (current) setError(true); });
    }, mode === "manual" ? 180 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [itemId, date, mode, manualRate, reload]);
  useEffect(() => { if (!edited) setAmount(preview?.cashDue ?? ""); }, [preview, edited]);
  const enteredAmount = amount.trim().replace(",", ".");
  const ready = Boolean(!error && preview?.rate && preview.totalUah && Number(preview.remaining) > 0 && /^\d+(?:\.\d{1,2})?$/.test(enteredAmount) && Number(enteredAmount) <= Number(preview.cashDue) && (Number(enteredAmount) === 0 ? Number(preview.advanceUsed) > 0 : accountId));
  return <FinanceActionForm action={recordFinancePayrollPayment} label={t(Number(amount) === 0 ? "applyAdvance" : "pay")} disabled={!ready} onResult={result => { if (result.status === "error") setReload(value => value + 1); }} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="digest" value={preview?.digest ?? ""} />
    <p className="text-sm font-medium">{preview?.employeeName ?? initial?.employeeName}</p>
    <p className="text-sm text-[var(--ui-text-secondary)]">{t("paymentHelp")}</p>
    <FormField label={financeT("movements.date")}><DatePicker name="date" value={date} onValueChange={value => { setDate(value); setEdited(false); }} max={today} locale={locale} required /></FormField>
    {salaryCurrency === "USD" ? <div className="flex flex-wrap items-end gap-3">
      <FormField label={t("rateSource")}><Select name="mode" size="compact" width="content" value={mode} onValueChange={value => { setMode(value === "manual" ? "manual" : "nbu"); setEdited(false); }} aria-label={t("rateSource")}><SelectItem value="nbu">{financeT("movements.nbuShort")}</SelectItem><SelectItem value="manual">{financeT("movements.manualShort")}</SelectItem></Select></FormField>
      {mode === "manual" ? <FormField label={t("rate")}><Input name="manualRate" aria-label={t("rate")} className="max-w-40" inputMode="decimal" value={manualRate} onChange={event => { setManualRate(event.target.value); setEdited(false); }} required /></FormField> : <input type="hidden" name="manualRate" value="" />}
      {preview?.rate ? <p className="pb-2 text-xs text-[var(--ui-text-muted)]">1 USD = {preview.rate} UAH · {formatDateOnly(date, locale)}</p> : null}
    </div> : <><input type="hidden" name="mode" value="nbu" /><input type="hidden" name="manualRate" value="" /></>}
    {preview ? <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-[var(--ui-text-muted)]">{t("salaryUah")}</dt><dd className="tabular-nums">{money(preview.totalUah)}</dd></div>
      <div><dt className="text-[var(--ui-text-muted)]">{t("advanceUsed")}</dt><dd className="tabular-nums">{money(preview.advanceUsed, preview.currency)}</dd></div>
      <div><dt className="text-[var(--ui-text-muted)]">{t("cashDue")}</dt><dd className="font-medium tabular-nums">{money(preview.cashDue)}</dd></div>
    </dl> : <p role="status" className="text-sm">{t("loading")}</p>}
    {error || preview && !preview.rate ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("quoteError")}</p> : null}
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label={financeT("movements.account")}><Select name="accountId" value={accountId} onValueChange={setAccountId} aria-label={financeT("movements.account")} required={Number(amount) > 0}><SelectItem value="">{t("chooseAccount")}</SelectItem>{active.map(account => <SelectItem key={account.id} value={account.id}>{account.name} · UAH</SelectItem>)}</Select></FormField>
      <FormField label={t("cashAmount")}><Input name="amount" aria-label={t("cashAmount")} value={amount} onChange={event => { setAmount(event.target.value); setEdited(true); }} inputMode="decimal" required /></FormField>
    </div>
    {!active.length && Number(enteredAmount) > 0 ? <p role="status" className="text-sm">{t("noUahAccount")}</p> : null}
    <p className="text-xs text-[var(--ui-text-muted)]">{t("excessHelp")}</p>
    <FormField label={financeT("movements.description")}><Textarea name="note" rows={2} maxLength={2000} /></FormField>
  </FinanceActionForm>;
}

export function PayrollAdvanceControl({ scheduleId, employeeName, accounts, today }: CashAccounts & { employeeName: string; scheduleId: string; today: string }) {
  const t = useTranslations("Finance.payrollCash"), financeT = useTranslations("Finance"), locale = useLocale(), router = useRouter();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [credit, setCredit] = useState<Awaited<ReturnType<typeof loadFinancePayrollCash>>>(null), [error, setError] = useState(false);
  const [mode, setMode] = useState<"nbu" | "manual">("nbu"), [manualRate, setManualRate] = useState(""), [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{ date: string; rate: string } | null>(null);
  const active = accounts.filter(account => !account.archived_at && account.currency === "UAH");
  const [date, setDate] = useState(today), [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [creditDate, setCreditDate] = useState("");
  useEffect(() => {
    if (!open) return;
    let current = true;
    loadFinancePayrollCash(scheduleId, date).then(value => { if (current) { setCredit(value); setCreditDate(date); setError(!value); } }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [scheduleId, open, date]);
  useEffect(() => { let current = true; if (open && credit?.currency === "USD" && mode === "nbu") quoteFinanceSettlement({ currency: "USD", obligationCurrency: "UAH", date }).then(value => { if (current) setQuote(value ? { date, rate: value.rate } : null); }).catch(() => { if (current) setQuote(null); }); return () => { current = false; }; }, [open, credit?.currency, mode, date]);
  const rate = creditDate !== date ? "" : credit?.currency === "UAH" ? "1" : mode === "manual" ? manualRate : quote?.date === date ? quote.rate : "";
  // Preview only. PostgreSQL calculates and freezes the authoritative currency credit.
  const inverseRate = Number(rate) > 0 ? (1 / Number(rate)).toFixed(10) : "";
  const equivalent = amount && inverseRate ? indicativeFinanceConversion(amount, inverseRate, 2, 2) : null;
  return <>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button type="button" size="sm" variant="outline" onClick={() => { setCredit(null); setCreditDate(""); setError(false); setOpen(true); }}>{t("advance")}</Button>
    </div>
    <Dialog className="h-auto max-h-[calc(100dvh-1rem)]" isOpen={open} onRequestClose={() => setOpen(false)} closeDisabled={pending} title={t("advance")} closeLabel={financeT("payrollEarning.close")}>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6"><FinanceActionForm action={recordFinancePayrollAdvance} label={t("recordAdvance")} disabled={!active.length || !rate || !["UAH", "USD"].includes(credit?.currency ?? "")} onPending={setPending} onSaved={() => { setOpen(false); router.refresh(); }}>
        <input type="hidden" name="scheduleId" value={scheduleId} /><input type="hidden" name="currency" value={credit?.currency ?? ""} />
        <p className="text-sm font-medium">{employeeName}</p>
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("advanceHelp")}</p>
        {credit?.balances.map(balance => <p key={balance.currency} className="text-xs text-[var(--ui-text-secondary)]">{t("available", { amount: formatFinanceDecimal(balance.available, locale, { maximumFractionDigits: 2 }), currency: balance.currency })}</p>)}
        {error ? <p role="alert" className="text-sm">{t("loadError")}</p> : null}
        <FormField label={financeT("movements.date")}><DatePicker name="date" value={date} onValueChange={setDate} max={today} locale={locale} required /></FormField>
        <FormField label={financeT("movements.account")}><Select name="accountId" value={accountId} onValueChange={setAccountId} aria-label={financeT("movements.account")} required>{active.map(account => <SelectItem key={account.id} value={account.id}>{account.name} · UAH</SelectItem>)}</Select></FormField>
        {!active.length ? <p role="status" className="text-sm">{t("noUahAccount")}</p> : null}
        {credit?.currency === "USD" ? <div className="flex flex-wrap items-end gap-3"><FormField label={t("rateSource")}><Select name="mode" size="compact" width="content" value={mode} onValueChange={value => setMode(value === "manual" ? "manual" : "nbu")} aria-label={t("rateSource")}><SelectItem value="nbu">{financeT("movements.nbuShort")}</SelectItem><SelectItem value="manual">{financeT("movements.manualShort")}</SelectItem></Select></FormField>{mode === "manual" ? <FormField label={t("rate")}><Input name="manualRate" aria-label={t("rate")} className="max-w-40" inputMode="decimal" value={manualRate} onChange={event => setManualRate(event.target.value)} required /></FormField> : <input type="hidden" name="manualRate" value="" />}{rate ? <p className="pb-2 text-xs text-[var(--ui-text-muted)]">1 USD = {rate} UAH · {formatDateOnly(date, locale)}</p> : <p role="status" className="text-xs">{t("quoteError")}</p>}</div> : <><input type="hidden" name="mode" value="nbu" /><input type="hidden" name="manualRate" value="" /></>}
        <FormField label={t("cashAmount")}><Input name="amount" aria-label={t("cashAmount")} value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required /></FormField>
        {equivalent && credit ? <p className="text-sm tabular-nums">{t("creditAmount", { amount: equivalent, currency: credit.currency ?? "" })}</p> : null}
        <FormField label={t("advanceNote")}><Textarea name="note" aria-label={t("advanceNote")} rows={2} maxLength={2000} required /></FormField>
      </FinanceActionForm></div>
    </Dialog>
  </>;
}
