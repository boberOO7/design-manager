"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getProjectSettlementOptions, saveProjectSettlement, saveRemainderAdjustment } from "@/app/(app)/finance/project-payments/actions";
import { quoteFinanceSettlement } from "@/app/(app)/finance/movements/actions";
import { actualFinanceSettlementRate, previewFinanceAllocationSplit, proposeFinanceAllocations } from "@/lib/finance-fx-preview";
import { financeAmountText, financeAmountUnits, formatFinanceAmount, formatFinanceDecimal } from "@/lib/finance";
import { remainderReasons, type ProjectSettlementOptions } from "@/lib/finance-project-settlement";
import type { FinanceExpected } from "@/lib/finance-planning";
import type { getFinanceData } from "@/data/queries/finance";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCategorySelect } from "./category-select";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { Check, Minus, Plus } from "lucide-react";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;

export function ProjectSettlementForm({ data, expected, projectId, today, onSaved, onPending }: {
  data: Foundation; expected: FinanceExpected; projectId: string; today: string; onSaved: () => void; onPending: (pending: boolean) => void;
}) {
  const t = useTranslations("Finance"), locale = useLocale();
  const noteId = useId(), noteField = useRef<HTMLTextAreaElement>(null);
  const [fxOpen, setFxOpen] = useState(false), [allocationOpen, setAllocationOpen] = useState(false), [noteOpen, setNoteOpen] = useState(false);
  useEffect(() => { if (noteOpen) noteField.current?.focus({ preventScroll: true }); }, [noteOpen]);
  const accounts = data.accounts.filter(account => !account.archived_at);
  const expectedCategory = data.categories.find(category => category.id === expected.category_id);
  const [categoryId, setCategoryId] = useState(expectedCategory && !expectedCategory.archived_at ? expectedCategory.id : "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const account = accounts.find(row => row.id === accountId);
  const native = data.currencies.find(row => row.code === account?.currency), obligation = data.currencies.find(row => row.code === expected.currency);
  const cross = account?.currency !== expected.currency;
  const [amount, setAmount] = useState(accounts[0]?.currency === expected.currency ? String(expected.remaining_amount ?? "") : "");
  const [date, setDate] = useState(today), [mode, setMode] = useState<"nbu" | "manual">("nbu");
  const [manualKind, setManualKind] = useState<"rate" | "equivalent">("rate"), [manual, setManual] = useState("");
  const [refresh, setRefresh] = useState(0), [stale, setStale] = useState(false), [staleResult, setStaleResult] = useState(false);
  const [options, setOptions] = useState<ProjectSettlementOptions | null>(null), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [quote, setQuote] = useState<{ key: string; value: Awaited<ReturnType<typeof quoteFinanceSettlement>> } | null>(null);
  const quoteKey = `${account?.currency}:${expected.currency}:${date}:${refresh}`;
  useEffect(() => {
    let current = true;
    setLoading(true); setLoadError(false);
    getProjectSettlementOptions(projectId, expected.id ?? "").then(value => { if (current) { setOptions(value); setLoadError(!value); } })
      .catch(() => { if (current) setLoadError(true); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [projectId, expected.id, refresh]);
  useEffect(() => {
    if (!cross || mode !== "nbu" || !account || !expected.currency) return;
    let current = true;
    quoteFinanceSettlement({ currency: account.currency, obligationCurrency: expected.currency, date }).then(value => { if (current) setQuote({ key: quoteKey, value }); })
      .catch(() => { if (current) setQuote({ key: quoteKey, value: null }); });
    return () => { current = false; };
  }, [cross, mode, account?.currency, expected.currency, date, quoteKey]);
  const quoted = quote?.key === quoteKey ? quote.value : null;
  const rate = !cross ? "1" : mode === "nbu" ? quoted?.rate ?? "" : manualKind === "rate" ? manual.trim().replace(",", ".") : native && obligation ? actualFinanceSettlementRate(amount, manual, native.minor_units, obligation.minor_units) ?? "" : "";
  const candidates = options?.candidates ?? [];
  const editKey = `${refresh}:${JSON.stringify(options?.snapshot)}:${accountId}:${amount}:${rate}`;
  const [edited, setEdited] = useState<{ key: string; amounts: string[] } | null>(null), [extraIds, setExtraIds] = useState<string[]>([]);
  let values: string[] = candidates.map(() => "0"), preview: ReturnType<typeof previewFinanceAllocationSplit> | null = null, error = "";
  try {
    if (native && obligation && rate && amount) {
      const empty = previewFinanceAllocationSplit(amount, rate, [], native.minor_units, obligation.minor_units);
      values = edited?.key === editKey ? edited.amounts : proposeFinanceAllocations(empty.converted, candidates.map(row => row.remaining), obligation.minor_units);
      candidates.forEach((row, index) => { if (financeAmountUnits(values[index].trim().replace(",", "."), obligation.minor_units) > financeAmountUnits(row.remaining, obligation.minor_units)) throw new Error("overallocated"); });
      preview = previewFinanceAllocationSplit(amount, rate, values, native.minor_units, obligation.minor_units);
      if (cross && mode === "manual" && manualKind === "equivalent" && financeAmountUnits(preview.converted, obligation.minor_units) !== financeAmountUnits(manual.replace(",", "."), obligation.minor_units)) throw new Error("unrepresentable");
    }
  } catch (cause) { preview = null; error = cause instanceof Error && ["unrepresentable", "overallocated"].includes(cause.message) ? cause.message : "invalid"; }
  const show = candidates.map((row, index) => ({ row, index })).filter(({ row, index }) => index === 0 || Number(values[index]) > 0 || extraIds.includes(row.id));
  const available = candidates.filter(row => !show.some(visible => visible.row.id === row.id));
  const money = (value: string, currency = obligation) => currency ? formatFinanceAmount(value, currency, locale) : value;
  const orderName = expected.order_name ?? options?.orderName;
  const remaining = candidates[0]?.remaining ?? String(expected.remaining_amount ?? "0");
  const hasExcess = Boolean(preview && obligation && financeAmountUnits(preview.converted, obligation.minor_units) > financeAmountUnits(remaining, obligation.minor_units));
  const selectedRemaining = preview && obligation ? financeAmountText(financeAmountUnits(remaining, obligation.minor_units) - financeAmountUnits(preview.allocations[0]?.amount ?? "0", obligation.minor_units), obligation.minor_units) : remaining;
  const distributed = candidates.flatMap((row, index) => index > 0 && preview && Number(preview.allocations[index]?.amount) > 0 ? [{ row, amount: preview.allocations[index].amount }] : []);
  const equivalentMoney = (value: string) => `${cross ? "≈ " : ""}${money(value)}`;
  const allocations = candidates.map((row, index) => ({ itemId: row.id, amount: preview?.allocations[index]?.amount ?? "0" }));
  return <FinanceActionForm action={saveProjectSettlement} onSaved={onSaved} onPending={onPending} onResult={result => { setStaleResult(result.id === "stalePreview"); if (result.id === "stalePreview") setStale(true); }} showMessage={!staleResult || stale} disabled={!preview || loading || loadError || stale} label={t("movements.record")} fieldsetClassName="min-w-0 space-y-3" submitClassName="min-h-11">
    <input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="expectedItemId" value={expected.id ?? ""}/>
    <input type="hidden" name="kind" value="incoming"/><input type="hidden" name="nature" value="operating"/>
    {expectedCategory && !expectedCategory.archived_at ? <input type="hidden" name="categoryId" value={categoryId}/> : <FinanceCategorySelect categories={data.categories.filter(category => category.nature === "operating")} direction="incoming" value={categoryId} onValueChange={setCategoryId}/>}
    <input type="hidden" name="allocations" value={JSON.stringify(allocations)}/><input type="hidden" name="snapshot" value={JSON.stringify(options?.snapshot ?? null)}/>
    <input type="hidden" name="settlementFx" value={JSON.stringify({ rate, source: !cross ? "identity" : mode, effectiveDate: date })}/>
    <div className="space-y-1">
      <p className="break-words text-sm font-semibold">{expected.description}{orderName ? <span className="font-normal text-[var(--ui-text-secondary)]"> · {orderName}</span> : null}</p>
      <p className="ui-numeric text-sm text-[var(--ui-text-secondary)]">{t("planning.remaining")} {money(remaining)}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <FormField label={t("movements.account")}><Select name="accountId" aria-label={t("movements.account")} value={accountId} onValueChange={value => { setAccountId(value); setMode("nbu"); setManual(""); setFxOpen(false); setAmount(accounts.find(row => row.id === value)?.currency === expected.currency ? String(expected.remaining_amount ?? "") : ""); }} required>{accounts.map(row => <SelectItem key={row.id} value={row.id}>{row.name} · {row.currency}</SelectItem>)}</Select></FormField>
      <FormField label={t("settlement.received")}><Input name="amount" aria-label={t("settlement.received")} data-dialog-initial-focus autoFocus inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required/></FormField>
    </div>
    <FormField label={t("movements.date")} className="w-48 max-w-full"><DatePicker name="date" aria-label={t("movements.date")} value={date} onValueChange={setDate} min="1900-01-01" max={today} locale={locale} required/></FormField>
    <div data-settlement-preview aria-busy={loading} className="min-h-12 sm:min-h-6">
      {loadError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("settlement.errors.load")}</p> : null}
      {preview && !loading && !loadError ? <p role="status" className="ui-numeric text-sm leading-relaxed text-[var(--ui-text-secondary)]">
        {equivalentMoney(preview.converted)} · {Number(selectedRemaining) > 0 ? t("settlement.willRemain", { amount: money(selectedRemaining) }) : distributed.length ? t("settlement.willCloseNamed", { name: candidates[0]?.title ?? expected.description ?? "" }) : <>{t("settlement.willSettle")} <Check aria-hidden="true" className="inline size-3.5 text-[var(--ui-success-text)]"/></>}
        {distributed.map(({ row, amount }) => <span key={row.id}> + {t("settlement.willApply", { amount: equivalentMoney(amount), name: row.title })}</span>)}
        {Number(preview.advance) > 0 ? <span> · {t("settlement.willLeaveUnallocated", { amount: money(preview.advance, native) })}</span> : null}
      </p> : null}
      {cross && mode === "nbu" && !quoted && amount && quote?.key === quoteKey ? <p role="status" className="text-xs text-[var(--ui-text-secondary)]">{t("settlement.quoteUnavailable")}</p> : null}
      {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t(`settlement.errors.${error}`)}</p> : null}
    </div>
    {stale || loadError ? <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => { setRefresh(value => value + 1); setStale(false); }}>{t("settlement.refresh")}</Button> : null}
    {cross ? <AnimatedDisclosure title={t("settlement.changeFx")} open={fxOpen} onOpenChange={setFxOpen}>
      <div className="space-y-3 pb-2">
        <FormField label={t("movements.settlementSourceLabel")}><Select aria-label={t("movements.settlementSourceLabel")} value={mode} onValueChange={value => setMode(value === "manual" ? "manual" : "nbu")}><SelectItem value="nbu">{t("movements.nbuShort")}</SelectItem><SelectItem value="manual">{t("settlement.actualRate")}</SelectItem></Select></FormField>
        {mode === "manual" ? <div className="grid gap-3 sm:grid-cols-2"><FormField label={t("settlement.manualInput")}><Select aria-label={t("settlement.manualInput")} value={manualKind} onValueChange={value => { setManualKind(value === "equivalent" ? "equivalent" : "rate"); setManual(""); }}><SelectItem value="rate">{t("settlement.rateOption")}</SelectItem><SelectItem value="equivalent">{t("settlement.equivalentOption", { currency: expected.currency ?? "" })}</SelectItem></Select></FormField><FormField label={t(manualKind === "rate" ? "movements.settlementRate" : "settlement.equivalent", { currency: account?.currency ?? "", obligation: expected.currency ?? "" })}><Input aria-label={t(manualKind === "rate" ? "movements.settlementRate" : "settlement.equivalent", { currency: account?.currency ?? "", obligation: expected.currency ?? "" })} inputMode="decimal" value={manual} onChange={event => setManual(event.target.value)} required/></FormField></div> : null}
        {/^[0-9]+(?:\.[0-9]+)?$/.test(rate) ? <p className="ui-numeric text-xs text-[var(--ui-text-muted)]">1 {account?.currency} = {formatFinanceDecimal(rate, locale, { maximumFractionDigits: 10 })} {expected.currency} · {date}</p> : null}
      </div>
    </AnimatedDisclosure> : null}
    {hasExcess || edited?.key === editKey || allocationOpen ? <AnimatedDisclosure title={t("settlement.changeAllocation")} open={allocationOpen} onOpenChange={setAllocationOpen}>
      <section aria-label={t("settlement.preview")} className="space-y-3 pb-2">
        {!loading && !loadError ? show.map(({ row, index }) => <div key={row.id} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]"><div className="min-w-0"><p className="break-words text-sm font-medium">{row.title}</p><p className="mt-0.5 text-xs text-[var(--ui-text-secondary)]">{t("planning.remaining")}: {money(row.remaining)}</p></div><FormField label={<span className="sr-only">{t("settlement.applyTo", { name: row.title, currency: options?.currency ?? "" })}</span>} className="min-w-0 [&>span]:hidden"><Input aria-label={t("settlement.applyTo", { name: row.title, currency: options?.currency ?? "" })} className="ui-numeric" inputMode="decimal" value={values[index]} onChange={event => { setExtraIds(ids => ids.includes(row.id) ? ids : [...ids, row.id]); setEdited({ key: editKey, amounts: values.map((value, i) => i === index ? event.target.value : value) }); }}/></FormField></div>) : null}
        {available.length && preview ? <Select aria-label={t("settlement.addPayment")} value="" onValueChange={value => setExtraIds(ids => [...ids, value])}><SelectItem value="">{t("settlement.addPayment")}</SelectItem>{available.map(row => <SelectItem key={row.id} value={row.id}>{row.title} · {money(row.remaining)}</SelectItem>)}</Select> : null}
        <p className="text-xs text-[var(--ui-text-muted)]">{t("settlement.unallocatedHelp")}</p>
      </section>
    </AnimatedDisclosure> : null}
    <div>
      <Button type="button" variant="ghost" size="sm" id={`${noteId}-trigger`} aria-expanded={noteOpen} aria-controls={noteId} className="min-h-11 gap-2 px-0 font-medium" onClick={() => setNoteOpen(value => !value)}>{noteOpen ? <Minus aria-hidden="true" className="size-4"/> : <Plus aria-hidden="true" className="size-4"/>}{t("settlement.addNote")}</Button>
      <AnimatedFormContent id={noteId} labelledBy={`${noteId}-trigger`} isOpen={noteOpen}><FormField label={t("movements.description")}><Textarea ref={noteField} name="description" rows={2} maxLength={2000}/></FormField></AnimatedFormContent>
    </div>
  </FinanceActionForm>;
}

export function RemainderClosureForm({ item, data, today, onSaved, onPending }: { item: FinanceExpected; data: Foundation; today: string; onSaved: () => void; onPending: (pending: boolean) => void }) {
  const t = useTranslations("Finance.settlement"), locale = useLocale();
  const [reason, setReason] = useState<(typeof remainderReasons)[number]>("fx_difference");
  const currency = data.currencies.find(row => row.code === item.currency);
  return <FinanceActionForm action={saveRemainderAdjustment} label={t("closeRemainder")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="itemId" value={item.id ?? ""}/><input type="hidden" name="remaining" value={item.remaining_amount ?? ""}/><input type="hidden" name="date" value={today}/>
    <p className="text-sm font-semibold">{item.description}</p><p className="ui-numeric text-xl font-semibold">{currency ? formatFinanceAmount(item.remaining_amount ?? 0, currency, locale) : `${item.remaining_amount} ${item.currency}`}</p>
    <p className="text-sm text-[var(--ui-text-secondary)]">{t("closureHelp")}</p>
    <FormField label={t("reason")}><Select name="reason" aria-label={t("reason")} value={reason} onValueChange={value => setReason(remainderReasons.find(item => item === value) ?? "other")}>{remainderReasons.map(value => <SelectItem key={value} value={value}>{t(`reasons.${value}`)}</SelectItem>)}</Select></FormField>
    {reason === "other" ? <FormField label={t("explanation")}><Textarea name="explanation" maxLength={2000} required/></FormField> : null}
    <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" name="confirmed" required className="mt-1 size-4"/>{t("confirmClosure")}</label>
  </FinanceActionForm>;
}
