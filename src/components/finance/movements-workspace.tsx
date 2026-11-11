"use client";
import { ExpenseReceiptControl } from "./expense-receipt-control";

import { ArrowLeftRight, ChevronDown, History, Info, Pencil, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { loadFinanceMovementHistory, quoteFinanceSettlement, saveFinanceMovement, valueFinanceMovement } from "@/app/(app)/finance/movements/actions";
import { fullFinanceSettlementAmount, indicativeFinanceConversion } from "@/lib/finance-fx-preview";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { AutoResizeTextarea as Textarea } from "@/components/ui/auto-resize-textarea";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { formatDateOnly } from "@/lib/utils";
import { financeAmountText, financeAmountUnits, formatFinanceAmount, sortFinanceAccounts } from "@/lib/finance";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCategorySelect } from "./category-select";
import type { FinanceExpected } from "@/lib/finance-planning";
import { financeCategoryLabel, financeMovementCategoryLabel } from "@/lib/finance-planning";
import type { getFinanceData, FinanceMovementWithEntries } from "@/data/queries/finance";
import type { FinanceSourceMovement } from "@/data/queries/finance-source-movement";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import type { FinanceProjectCash } from "@/data/queries/finance-project-cash";
import { projectCashSplitItemsSchema } from "@/lib/finance-profitability";
import { financeMovementPresentation } from "@/lib/finance-movement-context";
import { MovementFilters } from "./movement-filters";
import { hasMovementFilters, invalidMovementRange, movementFiltersHref, MOVEMENT_PAGE_SIZE, type FinanceMovementFilters } from "@/lib/finance-movement-filters";
import { Tooltip } from "@/components/ui/tooltip";

import { loadFinancePayrollPayment, loadFinancePayrollPeriod } from "@/app/(app)/finance/schedules/payroll-actions";
import { PayrollPaymentForm } from "./payroll-payment";
import type { PayrollPayment, PayrollPeriod } from "@/lib/finance-payroll-earnings";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";
const balanceLayout = "grid grid-cols-1 gap-x-8 lg:grid-cols-[12rem_minmax(0,1fr)]";
const balanceCurrencyColumns = "grid grid-cols-2 gap-x-6 sm:gap-x-8 lg:grid-cols-4 lg:gap-x-12";


type SplitRow = { projectId: string; amount: string };
const storedSplits = (payload: unknown, key: "projectReceiptSplits" | "projectRefundSplits"): SplitRow[] => {
  const record = z.record(z.string(), z.unknown()).safeParse(payload);
  if (!record.success) return [];
  const parsed = projectCashSplitItemsSchema.safeParse(record.data[key]);
  return parsed.success ? parsed.data.map(item => ({ ...item })) : [];
};
const splitJson = (rows: SplitRow[]) => JSON.stringify(rows.filter(row => row.projectId && row.amount.trim()).map(row => ({ projectId: row.projectId, amount: row.amount.trim().replace(",", ".") })));

export function EntryForm({ data, today, transfer, refund, correction, expected, defaultAccountId, projectCash, onSaved, onPending }: { data: Foundation; today: string; transfer: boolean; refund?: FinanceMovementWithEntries; correction?: FinanceMovementWithEntries; expected?:FinanceExpected|null; defaultAccountId?: string | null; projectCash?: FinanceProjectCash | null; onSaved: () => void; onPending: (pending: boolean) => void }) {
  const t = useTranslations("Finance.payrollCash");
  const [context, setContext] = useState<{ itemId: string; value: PayrollPayment | null; period?: PayrollPeriod } | null>(null);
  const [error, setError] = useState(false);
  const paymentCurrency = sortFinanceAccounts(data.accounts.filter(account => !account.archived_at), expected?.currency)[0]?.currency ?? expected?.currency ?? "UAH";
  useEffect(() => {
    let active = true;
    if (expected?.id && expected.direction === "outgoing" && !correction && !refund) loadFinancePayrollPayment(expected.id, today, "nbu", "", paymentCurrency).then(async value => {
      const period = value && expected.certainty === "estimated" ? await loadFinancePayrollPeriod(value.obligationId) : undefined;
      if (value && expected.certainty === "estimated" && !period) throw new Error("Unable to load payroll confirmation.");
      if (active) { setContext({ itemId: expected.id ?? "", value, period: period ?? undefined }); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [expected?.id, expected?.direction, expected?.certainty, today, correction, refund, paymentCurrency]);
  if (expected?.id && expected.direction === "outgoing" && !correction && !refund) {
    if (error) return <p role="alert">{t("loadError")}</p>;
    if (context?.itemId !== expected.id) return <p role="status">{t("loading")}</p>;
    if (context.value) return <PayrollPaymentForm currencies={data.currencies} accounts={data.accounts} today={today} itemId={expected.id} initial={context.value} period={context.period} onSaved={onSaved} onPending={onPending} />;
  }
  return <MovementEntryForm data={data} today={today} transfer={transfer} refund={refund} correction={correction} expected={expected} defaultAccountId={defaultAccountId} projectCash={projectCash} onSaved={onSaved} onPending={onPending} />;
}

function MovementEntryForm({ data, today, transfer, refund, correction, expected, defaultAccountId, projectCash, onSaved, onPending }: { data: Foundation; today: string; transfer: boolean; refund?: FinanceMovementWithEntries; correction?: FinanceMovementWithEntries; expected?:FinanceExpected|null; defaultAccountId?: string | null; projectCash?: FinanceProjectCash | null; onSaved: () => void; onPending: (pending: boolean) => void }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const active = sortFinanceAccounts(data.accounts.filter(account => !account.archived_at), expected?.currency);
  const originalEntry = correction?.entries.find((entry) => entry.entry_role === "primary");
  const originalDestination = correction?.entries.find((entry) => entry.entry_role === "destination");
  const originalAccount = originalEntry?.account_id ?? refund?.entries.find((entry) => entry.entry_role === "primary")?.account_id;
  const balanceCorrection = correction?.nature === "balance";
  const refundCorrection = correction?.kind === "refund";
  const originalPayload = correction?.request_payload;
  const payrollCurrency = originalPayload && typeof originalPayload === "object" && !Array.isArray(originalPayload) && typeof originalPayload.payrollCreditCurrency === "string" ? originalPayload.payrollCreditCurrency : null;
  const originalAllocationIntent = originalPayload && typeof originalPayload === "object" && !Array.isArray(originalPayload) && originalPayload.allocationIntent === true;
  const expectedCategory=data.categories.find((category)=>category.id===expected?.category_id);
  const expectedDescription=expected?.description??"";
  const expectedLabel=expectedCategory?.name&&expectedDescription.startsWith(`${expectedCategory.name} · `)
    ? financeCategoryLabel(expectedCategory,expectedDescription,(key)=>t(`planning.defaults.${key}`))
    : expectedDescription;
  const [kind, setKind] = useState(correction?.kind ?? (refund ? "refund" : transfer ? "transfer" : expectedCategory?.nature === "owner_distribution" ? "owner_withdrawal" : expected?.direction??"incoming"));
  const allowedCategories=expected?data.categories.filter((category)=>category.nature===expectedCategory?.nature):data.categories;
  const [categoryId,setCategoryId]=useState(correction?.category_id ?? (expectedCategory&&!expectedCategory.archived_at?expectedCategory.id:""));
  const [accountId, setAccountId] = useState(originalAccount ?? active.find(account => account.id === defaultAccountId)?.id ?? active[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState(originalDestination?.account_id ?? active.find((account) => account.id !== accountId)?.id ?? "");
  const [date, setDate] = useState(correction?.financial_date ?? today);
  const [amount, setAmount] = useState(originalEntry ? (balanceCorrection ? String(originalEntry.amount) : String(originalEntry.amount).replace(/^-/, "")) : expected && active.find(account => account.id === accountId)?.currency===expected.currency?expected.remaining_amount?.toString()??"":"");
  const sourceReceipt = projectCash?.receipts.find(item => item.id === (refund?.id ?? (refundCorrection ? correction?.related_movement_id : correction?.kind === "incoming" ? correction.id : undefined)));
  const previousRefundSplits = storedSplits(originalPayload, "projectRefundSplits");
  const [receiptSplitsEnabled, setReceiptSplitsEnabled] = useState(false);
  const [receiptRows, setReceiptRows] = useState<SplitRow[]>(() => correction?.kind === "incoming" ? projectCash?.receipts.find(item => item.id === correction.id)?.items.map(item => ({ projectId: item.projectId, amount: item.amount })) ?? [] : []);
  const [refundRows, setRefundRows] = useState<SplitRow[]>(() => previousRefundSplits);
  const [amountEdited,setAmountEdited]=useState(false);
  const [received, setReceived] = useState(originalDestination ? String(originalDestination.amount) : "");
  const [settlementMode,setSettlementMode]=useState<"nbu"|"manual">("nbu");
  const [settlementRate,setSettlementRate]=useState("");
  const [quoted,setQuoted]=useState<{key:string;value:Awaited<ReturnType<typeof quoteFinanceSettlement>>}|null>(null);
  const source = active.find((account) => account.id === accountId);
  const destination = active.find((account) => account.id === destinationId);
  const sameCurrency = source?.currency === destination?.currency;
  const quoteKey=source&&expected?`${source.currency}:${expected.currency}:${date}`:"";
  useEffect(()=>{
    if (!expected || !source || source.currency===expected.currency || settlementMode!=="nbu") return;
    let current=true;
    const key=`${source.currency}:${expected.currency}:${date}`;
    quoteFinanceSettlement({currency:source.currency,obligationCurrency:expected.currency??"",date}).then((value)=>{if(current)setQuoted({key,value});}).catch(()=>{if(current)setQuoted({key,value:null});});
    return ()=>{current=false;};
  },[expected,source,date,settlementMode]);
  const currentQuote=quoted?.key===quoteKey?quoted.value:null;
  const quoteLoaded=quoted?.key===quoteKey;
  const effectiveRate=settlementMode==="manual"?settlementRate:currentQuote?.rate??"";
  const settlementCurrency=data.currencies.find((currency)=>currency.code===expected?.currency);
  const accountCurrency=data.currencies.find((currency)=>currency.code===source?.currency);
  const fullAmount=expected&&settlementCurrency&&accountCurrency&&effectiveRate?fullFinanceSettlementAmount(expected.remaining_amount??0,effectiveRate,accountCurrency.minor_units,settlementCurrency.minor_units):null;
  useEffect(()=>{
    if (!expected || amountEdited) return;
    if (source?.currency===expected.currency) setAmount(String(expected.remaining_amount??""));
    else if (fullAmount) setAmount(fullAmount);
  },[expected,source?.currency,fullAmount,amountEdited]);
  const converted=settlementCurrency&&accountCurrency&&effectiveRate&&amount?indicativeFinanceConversion(amount,effectiveRate,accountCurrency.minor_units,settlementCurrency.minor_units):null;
  const credited=converted&&expected?Number(converted)>Number(expected.remaining_amount??0)?String(expected.remaining_amount??0):converted:null;
  const refundCategory=refund?financeMovementCategoryLabel(refund.category_id,refund.category,data.categories,(key)=>t(`planning.defaults.${key}`)):"";
  const moneyLabel=(value:string|number,code:string)=>{const currency=data.currencies.find((item)=>item.code===code);return currency?formatFinanceAmount(value,currency,locale):`${value} ${code}`;};
  const digits = data.currencies.find(currency => currency.code === source?.currency)?.minor_units ?? 2;
  const units = (value: string) => { try { return financeAmountUnits(value.trim().replace(",", "."), digits); } catch { return null; } };
  const rowAmounts = (rows: SplitRow[]) => rows.map(row => ({ ...row, units: row.amount.trim() ? units(row.amount) : null }));
  const totalUnits = (rows: SplitRow[]) => rowAmounts(rows).reduce((sum, row) => sum + (row.units ?? BigInt(0)), BigInt(0));
  const existingReceiptTotal = sourceReceipt?.items.reduce((sum, item) => sum + (units(item.amount) ?? BigInt(0)), BigInt(0)) ?? BigInt(0);
  const currentAmountUnits = units(amount);
  const receiptCurrencyChanged = Boolean(correction?.kind === "incoming" && source?.currency !== originalEntry?.currency);
  const receiptRequiresExplicit = Boolean(correction?.kind === "incoming" && sourceReceipt?.items.length && (receiptCurrencyChanged || (currentAmountUnits !== null && currentAmountUnits < existingReceiptTotal)));
  const receiptFieldActive = receiptSplitsEnabled || receiptRequiresExplicit;
  const receiptCheckedRows = rowAmounts(receiptRows);
  const receiptRowsValid = receiptCheckedRows.every(row => row.projectId && row.units !== null && row.units > BigInt(0))
    && new Set(receiptRows.map(row => row.projectId).filter(Boolean)).size === receiptRows.filter(row => row.projectId).length
    && (currentAmountUnits === null || totalUnits(receiptRows) <= currentAmountUnits);
  const receiptSplitsValid = !receiptFieldActive || (receiptRowsValid && (receiptRows.length === 0 || receiptRows.every(row => row.projectId && row.amount.trim())));
  const refundAvailable = new Map((sourceReceipt?.items ?? []).map(item => [item.projectId, units(item.amount) ?? BigInt(0)]));
  for (const row of previousRefundSplits) refundAvailable.set(row.projectId, (refundAvailable.get(row.projectId) ?? BigInt(0)) + (units(row.amount) ?? BigInt(0)));
  const refundCheckedRows = rowAmounts(refundRows);
  const refundTotal = totalUnits(refundRows);
  const refundIsAttributed = Boolean(sourceReceipt?.items.length || previousRefundSplits.length);
  const previousRefundPrincipal = refundCorrection && originalEntry ? (units(String(originalEntry.amount).replace(/^-/, "")) ?? BigInt(0)) : BigInt(0);
  const previousRefundTotal = totalUnits(previousRefundSplits);
  const refundUnattributedCapacity = (units(sourceReceipt?.unattributed ?? "0") ?? BigInt(0)) + previousRefundPrincipal - previousRefundTotal;
  const refundRowsValid = refundCheckedRows.every(row => row.projectId && row.units !== null && row.units > BigInt(0) && row.units <= (refundAvailable.get(row.projectId) ?? BigInt(-1)))
    && new Set(refundRows.map(row => row.projectId).filter(Boolean)).size === refundRows.filter(row => row.projectId).length
    && currentAmountUnits !== null && refundTotal <= currentAmountUnits
    && currentAmountUnits - refundTotal <= refundUnattributedCapacity;
  const refundSplitsValid = !refundIsAttributed || refundRowsValid;
  const formNature = correction?.nature === "financing" ? "financing" : data.categories.find(category => category.id === categoryId)?.nature === "financing" ? "financing" : "operating";
  const accounts = (exclude?: string) => active.filter((account) => account.id !== exclude).map((account) => <SelectItem key={account.id} value={account.id}>{account.name} · {account.currency}</SelectItem>);
  const accountField = <FormField label={transfer ? t("movements.fromAccount") : t("movements.account")}>{refund || refundCorrection ? <><Input value={source ? `${source.name} · ${source.currency}` : t("movements.errors.archived")} readOnly /><input type="hidden" name="accountId" value={accountId} /></> : <Select name="accountId" aria-label={transfer ? t("movements.fromAccount") : t("movements.account")} value={accountId} onValueChange={(value)=>{setAccountId(value);const next=active.find((entry)=>entry.id===value);if(correction?.kind==="incoming"&&next?.currency!==originalEntry?.currency)setReceiptRows(rows=>rows.map(row=>({...row,amount:""})));if(expected){setAmountEdited(false);setSettlementMode("nbu");setSettlementRate("");setAmount(next?.currency===expected.currency?String(expected.remaining_amount??""):"");}}} required>{accounts()}</Select>}</FormField>;
  const amountField = <FormField label={transfer ? t("movements.sentAmount") : expected ? expected.direction==="incoming" ? t("movements.actualAmount",{currency:source?.currency??""}) : `${t("movements.sentAmount")} (${source?.currency??""})` : t("movements.amount")}><Input className={expected?"ui-numeric text-lg font-semibold":undefined} name="amount" inputMode="decimal" value={amount} onChange={(event) => {setAmount(event.target.value);if(expected)setAmountEdited(true);}} required autoComplete="off" /></FormField>;
  const dateField = <FormField className={transfer ? "sm:col-start-1" : undefined} label={t("movements.date")}><DatePicker className={expected?"max-w-44":undefined} name="date" aria-label={t("movements.date")} value={date} onValueChange={(value)=>{setDate(value);if(expected&&source?.currency!==expected.currency&&settlementMode==="nbu"&&!amountEdited)setAmount("");}} min="1900-01-01" max={today} locale={locale} required /></FormField>;
  const categoryField = expected&&expectedCategory&&!expectedCategory.archived_at?<input type="hidden" name="categoryId" value={expectedCategory.id}/>:!transfer&&!refund&&!refundCorrection&&!balanceCorrection?<FinanceCategorySelect categories={allowedCategories} direction={kind==="incoming"?"incoming":"outgoing"} owner={kind==="owner_withdrawal"} value={categoryId} onValueChange={setCategoryId}/>:null;
  return <FinanceActionForm action={saveFinanceMovement} onSaved={onSaved} onPending={onPending} disabled={!receiptSplitsValid || !refundSplitsValid} submitClassName={expected ? "cursor-pointer transition-[background-color,filter] duration-200 hover:brightness-95 active:brightness-90 motion-reduce:transition-none" : undefined} label={t(correction ? "movements.saveCorrection" : expected ? "planning.recordPayment" : "movements.record")}>
    {correction ? <><input type="hidden" name="intent" value="correct"/><input type="hidden" name="movementId" value={correction.id}/><input type="hidden" name="nature" value={formNature}/>{originalAllocationIntent ? <input type="hidden" name="allocationIntent" value="true"/> : null}<p className="text-sm text-[var(--ui-text-secondary)]">{t("movements.correctionHelp")}</p>{refundCorrection ? <input type="hidden" name="relatedMovementId" value={correction.related_movement_id ?? ""}/> : null}</> : <input type="hidden" name="nature" value={formNature}/>}
    {transfer || refund || expected || correction ? <input type="hidden" name="kind" value={kind} /> : <FormField label={t("movements.type")}><Select name="kind" aria-label={t("movements.type")} value={kind} onValueChange={(value)=>{setKind(value);setCategoryId("");}}>{["incoming","outgoing","owner_withdrawal"].map((value) => <SelectItem key={value} value={value}>{t(`movements.kinds.${value}`)}</SelectItem>)}</Select></FormField>}
    {expected ? <div><input type="hidden" name="expectedItemId" value={expected.id ?? ""} /><input type="hidden" name="autoAllocate" value="true" /><p className="font-semibold">{expectedLabel}</p></div> : null}
    {refund ? <><input type="hidden" name="relatedMovementId" value={refund.id} /><p className="text-sm text-[var(--ui-text-secondary)]">{t("movements.refundHelp", { category: refundCategory })}</p></> : null}
    {expected ? <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">{accountField}{dateField}</div>
      <div className="space-y-4 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2 text-[var(--ui-text-secondary)]"><Wallet aria-hidden="true" className="size-4" />{t("planning.remaining")}</span><strong className="ui-numeric">{moneyLabel(expected.remaining_amount ?? 0, expected.currency ?? "")}</strong></div>
        <div className="flex flex-wrap items-end gap-3"><div className="w-36 sm:w-40">{amountField}</div>{source?.currency!==expected.currency ? <>
          <FormField className="w-36 sm:w-40" label={t("movements.settlementSourceLabel")}><Select name="settlementFxMode" aria-label={t("movements.settlementRateLabel")} value={settlementMode} onValueChange={(value)=>{setSettlementMode(value==="manual"?"manual":"nbu");if(!amountEdited)setAmount("");}}><SelectItem value="nbu">{t("movements.nbuShort")}</SelectItem><SelectItem value="manual">{t("movements.manualShort")}</SelectItem></Select></FormField>
          {settlementMode==="manual"?<FormField className="w-44" label={t("movements.settlementRate",{currency:source?.currency??"",obligation:expected.currency??""})}><Input className="max-w-44" name="settlementManualRate" inputMode="decimal" value={settlementRate} onChange={(event)=>setSettlementRate(event.target.value)} required/></FormField>:null}
        </> : null}</div>
        {source?.currency!==expected.currency ? <div className="space-y-2">
      {effectiveRate&&source?<p className="flex items-start gap-2 text-xs text-[var(--ui-text-secondary)]"><ArrowLeftRight aria-hidden="true" className="size-4 shrink-0" /><span>{t("movements.settlementRateCompact",{currency:source.currency,obligation:expected.currency??"",rate:effectiveRate,source:settlementMode==="nbu"?t("movements.nbuShort"):t("movements.manualShort"),date:formatDateOnly(settlementMode==="nbu"?currentQuote?.effectiveDate??date:date,locale)})}{settlementMode==="nbu"&&currentQuote?.indicative?<> · {t("movements.indicativeRate")}</>:null}</span></p>:null}
      {credited!==null&&source?<p className="ui-numeric text-sm font-semibold text-[var(--ui-text)]">{moneyLabel(amount,source.currency)} → {moneyLabel(credited,expected.currency??"")}</p>:null}
      {settlementMode==="nbu"&&!effectiveRate?<p className="text-xs text-[var(--ui-text-secondary)]">{quoteLoaded?t("movements.quoteUnavailable"):t("movements.quoteLoading")}</p>:null}
        </div> : null}
      </div>
      {categoryField}
    </> : <div className="grid gap-4 sm:grid-cols-2">
      {accountField}{amountField}
      {transfer ? <FormField label={t("movements.toAccount")}><Select name="destinationId" aria-label={t("movements.toAccount")} value={destinationId} onValueChange={setDestinationId} required>{accounts(accountId)}</Select></FormField> : null}
      {transfer ? sameCurrency ? <input type="hidden" name="receivedAmount" value={amount}/> : <FormField label={t("movements.receivedAmount")}><Input name="receivedAmount" inputMode="decimal" value={received} onChange={(event) => setReceived(event.target.value)} required autoComplete="off" /></FormField> : null}
      {dateField}
      {categoryField}
    </div>}
    {kind === "owner_withdrawal" ? <p className="text-sm text-[var(--ui-text-muted)]">{t("movements.ownerHelp")}</p> : null}
    {!transfer&&!refund&&!refundCorrection&&!expected&&!balanceCorrection&&kind==="incoming"&&formNature==="operating" ? <AnimatedDisclosure title={t("movements.projectCash.receiptTitle")}>
      <div className="space-y-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] p-3">
        {receiptRequiresExplicit ? <p role="status" className="text-sm text-[var(--ui-warning-text)]">{t("movements.projectCash.receiptRequired")}</p> : correction&&sourceReceipt?.items.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("movements.projectCash.receiptPreserved",{amount:financeAmountText(existingReceiptTotal,digits),currency:source?.currency??""})}</p> : null}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={receiptFieldActive} onChange={event=>setReceiptSplitsEnabled(event.target.checked)} className="mt-1 size-4" />{t("movements.projectCash.confirmReceipt")}</label>
        <p className="text-xs text-[var(--ui-text-muted)]">{t("movements.projectCash.receiptHelp")}</p>
        {receiptFieldActive ? <>
          <input type="hidden" name="projectReceiptSplits" value={splitJson(receiptRows)} />
          {receiptRows.map((row,index)=><div key={`${index}:${row.projectId}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
            <Select aria-label={t("movements.projectCash.project")} value={row.projectId} onValueChange={value=>setReceiptRows(rows=>rows.map((item,i)=>i===index?{...item,projectId:value}:item))}><SelectItem value="">{t("movements.projectCash.chooseProject")}</SelectItem>{(projectCash?.projects??[]).map(project=><SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</Select>
            <Input aria-label={t("movements.projectCash.amount",{currency:source?.currency??""})} inputMode="decimal" value={row.amount} onChange={event=>setReceiptRows(rows=>rows.map((item,i)=>i===index?{...item,amount:event.target.value}:item))} />
            <Button type="button" size="sm" variant="ghost" onClick={()=>setReceiptRows(rows=>rows.filter((_,i)=>i!==index))}>{t("movements.projectCash.remove")}</Button>
          </div>)}
          <Button type="button" size="sm" variant="outline" onClick={()=>setReceiptRows(rows=>[...rows,{projectId:"",amount:""}])}>{t("movements.projectCash.addProject")}</Button>
          {!receiptRowsValid ? <p role="alert" className="text-xs text-[var(--ui-danger-text)]">{t("movements.projectCash.invalidReceipt")}</p> : null}
        </> : null}
      </div>
    </AnimatedDisclosure> : null}
    {refundIsAttributed ? <div className="space-y-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] p-3">
      <p className="text-sm font-medium">{t("movements.projectCash.refundTitle")}</p><p className="text-xs text-[var(--ui-text-muted)]">{t("movements.projectCash.refundHelp")}</p>
      <input type="hidden" name="projectRefundSplits" value={splitJson(refundRows)} />
      {refundRows.map((row,index)=>{const cap=refundAvailable.get(row.projectId);return <div key={`${index}:${row.projectId}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
        <Select aria-label={t("movements.projectCash.project")} value={row.projectId} onValueChange={value=>setRefundRows(rows=>rows.map((item,i)=>i===index?{...item,projectId:value}:item))}><SelectItem value="">{t("movements.projectCash.chooseProject")}</SelectItem>{(sourceReceipt?.items??[]).map(item=>{const project=projectCash?.projects.find(p=>p.id===item.projectId);return <SelectItem key={item.projectId} value={item.projectId}>{project?.name??item.projectId} · {t("movements.projectCash.available",{amount:financeAmountText(refundAvailable.get(item.projectId)??BigInt(0),digits),currency:source?.currency??""})}</SelectItem>})}{previousRefundSplits.filter(item=>!sourceReceipt?.items.some(current=>current.projectId===item.projectId)).map(item=>{const project=projectCash?.projects.find(p=>p.id===item.projectId);return <SelectItem key={item.projectId} value={item.projectId}>{project?.name??item.projectId}</SelectItem>})}</Select>
        <Input aria-label={t("movements.projectCash.amount",{currency:source?.currency??""})} inputMode="decimal" value={row.amount} onChange={event=>setRefundRows(rows=>rows.map((item,i)=>i===index?{...item,amount:event.target.value}:item))} />
        <Button type="button" size="sm" variant="ghost" onClick={()=>setRefundRows(rows=>rows.filter((_,i)=>i!==index))}>{t("movements.projectCash.remove")}</Button>
        {cap!==undefined?<p className="text-xs text-[var(--ui-text-muted)]">{t("movements.projectCash.remainingForProject",{amount:financeAmountText(cap,digits),currency:source?.currency??""})}</p>:null}
      </div>})}
      <Button type="button" size="sm" variant="outline" onClick={()=>setRefundRows(rows=>[...rows,{projectId:"",amount:""}])}>{t("movements.projectCash.addProject")}</Button>
      {currentAmountUnits!==null?<p className="ui-numeric text-xs text-[var(--ui-text-secondary)]">{t("movements.projectCash.unattributed",{amount:financeAmountText(currentAmountUnits>refundTotal?currentAmountUnits-refundTotal:BigInt(0),digits),currency:source?.currency??""})}</p>:null}
      {!refundRowsValid?<p role="alert" className="text-xs text-[var(--ui-danger-text)]">{t("movements.projectCash.invalidRefund")}</p>:null}
    </div>:null}
    {payrollCurrency && source?.currency !== payrollCurrency ? <div className="space-y-2"><p className="text-xs text-[var(--ui-text-secondary)]">{t("payrollCash.correctionHelp")}</p><div className="flex flex-wrap items-end gap-3"><FormField label={t("payrollCash.rateSource")}><Select name="settlementFxMode" width="content" aria-label={t("payrollCash.rateSource")} value={settlementMode} onValueChange={value => setSettlementMode(value === "manual" ? "manual" : "nbu")}><SelectItem value="nbu">{t("movements.nbuShort")}</SelectItem><SelectItem value="manual">{t("movements.manualShort")}</SelectItem></Select></FormField>{settlementMode === "manual" ? <FormField label={t("payrollCash.rate", { currency: source?.currency ?? "", salary: payrollCurrency ?? "" })}><Input className="w-40" name="settlementManualRate" aria-label={t("payrollCash.rate", { currency: source?.currency ?? "", salary: payrollCurrency ?? "" })} inputMode="decimal" value={settlementRate} onChange={event => setSettlementRate(event.target.value)} required /></FormField> : null}</div></div> : null}
    <AnimatedDisclosure title={t("movements.description")} defaultOpen={Boolean(correction?.description)}><Textarea name="description" aria-label={t("movements.description")} rows={1} maxLength={2000} defaultValue={correction?.description ?? ""}/></AnimatedDisclosure>
    {transfer ? <FormField label={t("movements.fee", { currency: source?.currency ?? "" })}><Input name="fee" inputMode="decimal" defaultValue={String(correction?.entries.find((entry)=>entry.entry_role==="fee")?.amount ?? "0").replace(/^-/, "")} required /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("movements.feeHelp")}</span></FormField> : null}
    {correction ? <p className="text-xs text-[var(--ui-text-muted)]">{t("movements.historyHelp")}</p> : null}
  </FinanceActionForm>;
}

export function FinanceMovementsWorkspace(props: Foundation & { movements: FinanceMovementWithEntries[]; total: number; page: number; today: string; filters: FinanceMovementFilters; expected?:FinanceExpected|null; defaultAccountId?: string | null; returnHref?:string; sourceMovement?: FinanceSourceMovement | null; movementLinkUnavailable?: boolean; projectCash?: FinanceProjectCash | null }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const router=useRouter();
  const [editor, setEditor] = useState<"incoming" | "transfer" | FinanceMovementWithEntries | null>(props.expected?"incoming":null);
  const [reversing, setReversing] = useState<FinanceMovementWithEntries | null>(null);
  const [correcting, setCorrecting] = useState<FinanceMovementWithEntries | null>(null);
  const [valuing, setValuing] = useState<{ movement: FinanceMovementWithEntries; currency: string; reportingCurrency: string } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(props.sourceMovement?.id ?? null);
  const [historyRows, setHistoryRows] = useState<Awaited<ReturnType<typeof loadFinanceMovementHistory>> | null>(props.sourceMovement ? { movements: props.sourceMovement.movements, error: false } : null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!historyId || historyId === props.sourceMovement?.id) return;
    let current = true;
    loadFinanceMovementHistory(historyId).then((rows) => { if (current) setHistoryRows(rows); }).catch(() => { if (current) setHistoryRows({ movements: [], error: true }); });
    return () => { current = false; };
  }, [historyId, props.sourceMovement?.id]);
  const [balancesOpen, setBalancesOpen] = useState(false);
  const ready = Boolean(props.settings?.finalized_at);
  const balanceTotals = props.currencies.flatMap(currency => {
    const entries = props.balances.filter(balance => balance.currency === currency.code);
    if (!entries.length) return [];
    const amount = entries.some(entry => entry.recorded_balance === null) ? null : financeAmountText(entries.reduce((sum, entry) => sum + financeAmountUnits(entry.recorded_balance ?? "0", currency.minor_units), BigInt(0)), currency.minor_units);
    return [{ currency: currency.code, amount }];
  });
  const active = props.accounts.filter((account) => !account.archived_at);
  const cancelledHistoryIds = new Set(historyRows?.movements.filter((movement) => movement.kind === "reversal").map((movement) => movement.related_movement_id));
  const money = (amount: number | string, code: string, style: "currency" | "decimal" = "currency") => {
    const currency = props.currencies.find((item) => item.code === code);
    return currency ? formatFinanceAmount(amount, currency, locale, style) : `${amount} ${code}`;
  };
  const openHistory = (id: string) => {
    if (props.sourceMovement?.id === id) setHistoryRows({ movements: props.sourceMovement.movements, error: false });
    else setHistoryRows(null);
    setHistoryId(id);
  };
  return <div className="w-full min-w-0 space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex items-center gap-1.5"><h1 className="text-2xl font-semibold text-[var(--ui-text)]">{t("movements.title")}</h1><Tooltip openOnClick content={t("movements.descriptionText")}><Button variant="ghost" size="compact" className="w-9 px-0" aria-label={t("movements.filters.about")}><Info className="size-4" aria-hidden="true" /></Button></Tooltip></div>
      {ready ? <div className="flex flex-wrap gap-2"><Button size="compact" className="gap-2" disabled={!active.length} onClick={() => setEditor("incoming")}><Plus className="size-4" aria-hidden="true"/>{t("movements.filters.add")}</Button><Button size="compact" variant="outline" disabled={active.length<2} onClick={() => setEditor("transfer")}><ArrowLeftRight className="size-4" aria-hidden="true"/>{t("movements.kinds.transfer")}</Button></div> : null}
    </header>
    {props.movementLinkUnavailable ? <p role="status" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] p-3 text-sm text-[var(--ui-text-secondary)]">{t("movements.sourceUnavailable")}</p> : null}
    {!ready ? <p className={`${panel} p-5 text-sm text-[var(--ui-text-secondary)]`}>{t("movements.setupRequired")} <Link className="underline" href="/finance/accounts">{t("movements.setupLink")}</Link></p> : <section aria-label={t("movements.recordedBalance")} className={panel}>
      <div className="relative">
        <button type="button" id="movement-balances-trigger" aria-label={t("movements.recordedBalance")} aria-describedby="movement-balance-totals" aria-expanded={balancesOpen} aria-controls="movement-account-balances" onClick={() => setBalancesOpen(!balancesOpen)} className={`${balanceLayout} w-full cursor-pointer items-center gap-y-3 rounded-[var(--ui-radius-panel)] px-4 py-3 text-left transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none sm:pr-14`}>
          <span className="flex items-center gap-2 pr-10 text-sm font-medium text-[var(--ui-text-secondary)] lg:pr-0"><ChevronDown className={`size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${balancesOpen ? "rotate-180" : ""}`} aria-hidden="true" />{t("movements.recordedBalance")}</span>
          <span id="movement-balance-totals" className={`${balanceCurrencyColumns} gap-y-3`}>{balanceTotals.map(balance => <span key={balance.currency} className="flex min-w-0 flex-col gap-0.5"><span className="text-xs text-[var(--ui-text-muted)]">{balance.currency}</span><span className="ui-numeric whitespace-nowrap text-sm font-semibold text-[var(--ui-text)]">{balance.amount === null ? "—" : money(balance.amount, balance.currency, "decimal")}</span></span>)}</span>
        </button>
        <Tooltip openOnClick content={t("movements.filters.balanceHelp")}><Button variant="ghost" size="compact" className="absolute right-2 top-2 size-9 px-0" aria-label={t("movements.filters.aboutBalances")}><Info className="size-4" aria-hidden="true" /></Button></Tooltip>
      </div>
      <AnimatedFormContent id="movement-account-balances" labelledBy="movement-balances-trigger" isOpen={balancesOpen}>
        <div className={`${balanceLayout} border-t border-[var(--ui-border)] px-4 py-4 sm:pr-14`}><div className={`${balanceCurrencyColumns} gap-y-5 lg:col-start-2`}>{balanceTotals.map(group => <section key={group.currency} aria-label={group.currency} className="min-w-0">
          <h2 className="mb-2 text-xs font-medium text-[var(--ui-text-muted)]">{group.currency}</h2>
          <dl className="divide-y divide-[var(--ui-border-subtle)]">{props.accounts.filter(account => account.currency === group.currency).flatMap(account => {
            const balance = props.balances.find(item => item.id === account.id);
            return balance ? [<div key={balance.id} className="grid grid-cols-1 items-baseline gap-x-3 gap-y-1 py-2 text-sm 2xl:grid-cols-[minmax(0,1fr)_auto]"><dt className="min-w-0 break-words text-[var(--ui-text-secondary)]">{balance.name}{balance.archived_at ? <span className="block text-xs text-[var(--ui-text-muted)]">{t("movements.archived")}</span> : null}</dt><dd className="ui-numeric whitespace-nowrap font-medium 2xl:text-right">{balance.recorded_balance !== null && balance.currency ? money(balance.recorded_balance, balance.currency, "decimal") : "—"}<span className="sr-only"> {group.currency}</span></dd></div>] : [];
          })}</dl>
        </section>)}</div></div>
      </AnimatedFormContent>
    </section>}
    <MovementFilters filters={props.filters} accounts={props.accounts} categories={props.categories} currencies={props.currencies} total={props.total} today={props.today}/>
    <section aria-label={t("movements.history")} className={`${panel} overflow-hidden`}>
      {props.movements.length ? <><div aria-hidden="true" className="hidden min-h-10 grid-cols-[6.5rem_minmax(0,1.5fr)_minmax(8rem,1fr)_7rem_minmax(9rem,auto)_1.25rem] items-center gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-4 text-xs font-medium text-[var(--ui-text-muted)] lg:grid"><span>{t("movements.date")}</span><span>{t("movements.ledgerTitle")}</span><span>{t("movements.account")}</span><span>{t("movements.type")}</span><span className="text-right">{t("movements.amount")}</span><span/></div><ul className="divide-y divide-[var(--ui-border)]">{props.movements.map((movement) => {
        const reversed = movement.reversed;
        const unresolved = movement.entries.some(entry => entry.reporting_amount === null);
        const primary = movement.entries.find((entry) => entry.entry_role === "primary");
        const destination = movement.entries.find((entry) => entry.entry_role === "destination");
        const activeOriginalAccount = active.some((account) => account.id === primary?.account_id);
        const { title, category, context } = financeMovementPresentation(movement, movement.context, { categories: props.categories, projectCash: props.projectCash, locale, translate: key => t(key) });
        const secondary = [title !== category && movement.nature !== "balance" ? category : "", context].filter(Boolean).join(" · ");
        const accountName=(id?:string)=>props.accounts.find((account)=>account.id===id)?.name??"—";
        const accountText=movement.kind==="transfer"?`${accountName(primary?.account_id)} → ${accountName(destination?.account_id)}`:accountName(primary?.account_id);
        const displayMoney=(entry:typeof primary)=>{if(!entry)return "—";const formatted=money(entry.amount,entry.currency);return Number(entry.amount)>0?`+${formatted}`:formatted;};
        const absoluteMoney=(entry:typeof primary)=>entry?money(String(entry.amount).replace(/^-/,""),entry.currency):"—";
        const sameCurrencyTransfer=movement.kind==="transfer"&&primary?.currency===destination?.currency;
        const amountTone=["transfer","balance"].includes(movement.nature)?"text-[var(--ui-text)]":Number(primary?.amount??0)>0?"text-[var(--ui-success-text)]":"text-[var(--ui-danger-text)]";
        return <li key={movement.id}><details className="group"><summary aria-label={t("movements.detailsNamed",{name:context ? `${title} · ${context}` : title})} className="grid min-h-16 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_1.25rem] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none lg:min-h-12 lg:grid-cols-[6.5rem_minmax(0,1.5fr)_minmax(8rem,1fr)_7rem_minmax(9rem,auto)_1.25rem] lg:py-2">
          <span className="col-start-1 row-start-2 text-xs text-[var(--ui-text-muted)] lg:col-start-1 lg:row-start-1">{formatDateOnly(movement.financial_date, locale)}<span className="lg:hidden"> · {t(`movements.kinds.${movement.kind}`)}</span></span>
          <span className="col-start-1 row-start-1 min-w-0 text-sm font-medium text-[var(--ui-text)] lg:col-start-2">
            <span className="block truncate">{title}{unresolved ? <span className="ml-2 text-xs font-normal text-[var(--ui-warning-text)]">{t("movements.valuationUnresolved")}</span> : null}{reversed ? <span className="ml-2 rounded-full bg-[var(--ui-surface-muted)] px-2 py-0.5 text-xs font-normal text-[var(--ui-text-muted)]">{t("movements.reversed")}</span> : null}</span>
            {secondary ? <Tooltip content={secondary} onlyWhenTruncated><span tabIndex={0} className="mt-0.5 block truncate text-xs font-normal text-[var(--ui-text-secondary)]">{secondary}</span></Tooltip> : null}
          </span>
          <span className="col-start-1 row-start-3 min-w-0 truncate text-xs text-[var(--ui-text-secondary)] lg:col-start-3 lg:row-start-1 lg:text-sm">{accountText}</span>
          <span className="hidden text-xs text-[var(--ui-text-secondary)] lg:col-start-4 lg:block">{t(`movements.kinds.${movement.kind}`)}</span>
          <span className={`ui-numeric col-start-2 row-span-3 row-start-1 whitespace-nowrap text-right text-sm font-semibold lg:col-start-5 lg:row-span-1 ${amountTone}`}>{movement.kind==="transfer"?(sameCurrencyTransfer?absoluteMoney(primary):<><span className="block">{absoluteMoney(primary)}</span><span className="block text-xs font-medium">→ {absoluteMoney(destination)}</span></>):displayMoney(primary)}</span>
          <ChevronDown className="col-start-3 row-span-3 row-start-1 size-4 text-[var(--ui-text-muted)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none lg:col-start-6 lg:row-span-1" aria-hidden="true"/>
        </summary><div className="space-y-3 border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-4 py-3 text-sm">
          {movement.description ? <p className="whitespace-pre-wrap break-words">{movement.description}</p> : null}
          <p className="text-xs text-[var(--ui-text-secondary)]">{[movement.nature !== "balance" ? category : "", t(`movements.natures.${movement.nature}`)].filter(Boolean).join(" · ")}</p>
          {context ? <p className="whitespace-pre-wrap break-words text-[var(--ui-text-secondary)]">{context}</p> : null}
          {!reversed && movement.kind === "outgoing" && movement.nature === "operating" && !movement.context.length && !["salary", "employee_bonus"].includes(props.categories.find(category => category.id === movement.category_id)?.default_key ?? "") ? <ExpenseReceiptControl kind="movement" sourceId={movement.id} baseCurrency={props.settings?.base_currency ?? "UAH"} today={props.today}/> : null}
          <div className="space-y-1 text-xs text-[var(--ui-text-muted)]">{movement.entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-x-2 gap-y-1"><p>{accountName(entry.account_id)}{entry.entry_role === "fee" ? ` (${t("movements.feeShort")})` : ""}: {displayMoney(entry)}{entry.currency !== entry.reporting_currency && entry.reporting_amount !== null && entry.fx_source && entry.fx_effective_date ? ` ≈ ${money(entry.reporting_amount,entry.reporting_currency)} · ${t(`movements.sources.${entry.fx_source}`)} ${entry.fx_rate} · ${formatDateOnly(entry.fx_effective_date,locale)}` : ""}</p>{entry.reporting_amount === null && entry.entry_role !== "fee" && !reversed && movement.kind !== "reversal" ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setValuing({ movement, currency: entry.currency, reportingCurrency: entry.reporting_currency })}>{t("movements.valueManually")}</Button> : null}</div>)}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!reversed && movement.kind !== "reversal" ? <>
              <Button size="sm" className="gap-1.5" onClick={() => setCorrecting(movement)}><Pencil className="size-3.5" aria-hidden="true"/>{t("movements.correct")}</Button>
              {["incoming","outgoing"].includes(movement.kind) && activeOriginalAccount ? <Button size="sm" variant="outline" onClick={() => setEditor(movement)}>{t("movements.refund")}</Button> : null}
            </> : null}
            {movement.supersedesId || reversed || movement.kind === "reversal" ? <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => openHistory(movement.id)}><History className="size-4" aria-hidden="true"/>{t("movements.correctionHistory")}</Button> : null}
            {!reversed && movement.kind !== "reversal" ? <Button size="sm" variant="ghost" className="text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)]" onClick={() => setReversing(movement)}>{t("movements.reverse")}</Button> : null}
          </div>
        </div></details></li>;
      })}</ul></> : <div className="space-y-2 p-5 text-sm" role="status"><p className="font-medium">{t(invalidMovementRange(props.filters) ? "movements.filters.invalidRange" : hasMovementFilters(props.filters) ? "movements.filters.noResults" : "movements.empty")}</p>{hasMovementFilters(props.filters) ? <><p className="text-[var(--ui-text-secondary)]">{t("movements.filters.noResultsHelp")}</p><Button asChild variant="outline" size="compact"><Link href="/finance/movements">{t("movements.filters.reset")}</Link></Button></> : null}</div>}
    </section>
    <nav aria-label={t("movements.pages")} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="ui-numeric text-xs text-[var(--ui-text-muted)]">{t("movements.filters.range", { from: props.total ? (props.page - 1) * MOVEMENT_PAGE_SIZE + 1 : 0, to: Math.min(props.page * MOVEMENT_PAGE_SIZE, props.total), total: props.total })}</p>
      <div className="flex gap-2">{props.page > 1 ? <Button asChild variant="outline" size="compact"><Link href={movementFiltersHref(props.filters, props.page - 1)}>{t("movements.previous")}</Link></Button> : null}{props.page * MOVEMENT_PAGE_SIZE < props.total ? <Button asChild variant="outline" size="compact"><Link href={movementFiltersHref(props.filters, props.page + 1)}>{t("movements.next")}</Link></Button> : null}</div>
    </nav>
    <Dialog isOpen={correcting !== null} closeDisabled={pending} onRequestClose={() => setCorrecting(null)} title={t("movements.correct")} closeLabel={t("movements.close")}>
      {correcting ? <div className="p-5"><EntryForm data={props} today={props.today} transfer={correcting.kind === "transfer"} correction={correcting} projectCash={props.projectCash} onSaved={() => setCorrecting(null)} onPending={setPending}/></div> : null}
    </Dialog>
    <Dialog isOpen={valuing !== null} closeDisabled={pending} onRequestClose={() => setValuing(null)} title={t("movements.valueManually")} closeLabel={t("movements.close")}>
      {valuing ? <div className="p-5"><FinanceActionForm action={valueFinanceMovement} label={t("movements.valueManually")} onSaved={() => setValuing(null)} onPending={setPending}>
        <input type="hidden" name="movementId" value={valuing.movement.id}/><input type="hidden" name="currency" value={valuing.currency}/>
        <p className="text-sm text-[var(--ui-text-secondary)]">{formatDateOnly(valuing.movement.financial_date, locale)}</p>
        <FormField label={t("movements.rate", { currency: valuing.currency, base: valuing.reportingCurrency })}><Input name="rate" inputMode="decimal" required autoComplete="off"/></FormField>
      </FinanceActionForm></div> : null}
    </Dialog>
    <Dialog isOpen={historyId !== null} onRequestClose={() => setHistoryId(null)} title={t("movements.history")} closeLabel={t("movements.close")}>
      <div className="space-y-4 p-5">
        {historyRows === null ? <p role="status">{t("movements.historyLoading")}</p> : historyRows.error ? <p role="alert">{t("movements.errors.history")}</p> : <ol className="space-y-3">{historyRows.movements.map((movement) => <li key={movement.id} className="space-y-1 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3 text-sm"><p className="font-medium">{t(`movements.kinds.${movement.kind}`)} · {formatDateOnly(movement.financial_date, locale)}{movement.kind !== "reversal" ? <span className="ml-2 text-xs font-normal text-[var(--ui-text-muted)]">{t(cancelledHistoryIds.has(movement.id) ? "movements.cancelledVersion" : "movements.currentVersion")}</span> : null}</p>{movement.description ? <p>{movement.description}</p> : null}<p className="text-[var(--ui-text-secondary)]">{financeMovementCategoryLabel(movement.category_id,movement.category,props.categories,(key)=>t(`planning.defaults.${key}`))}</p>{movement.entries.map((entry) => <p className="ui-numeric text-xs text-[var(--ui-text-secondary)]" key={entry.id}>{props.accounts.find((account) => account.id === entry.account_id)?.name ?? "—"}: {money(entry.amount,entry.currency)}{entry.currency !== entry.reporting_currency ? entry.reporting_amount === null ? ` · ${t("movements.valuationUnresolved")}` : ` ≈ ${money(entry.reporting_amount,entry.reporting_currency)}` : ""}{entry.fx_rate && entry.fx_effective_date ? ` · ${t(`movements.sources.${entry.fx_source ?? "manual"}`)} ${entry.fx_rate} · ${formatDateOnly(entry.fx_effective_date,locale)}` : ""}</p>)}</li>)}</ol>}
        {historyRows && !historyRows.error && historyId === props.sourceMovement?.id ? <section className="space-y-2 border-t border-[var(--ui-border)] pt-3" aria-label={t("movements.matchingTitle")}>
          <h3 className="text-sm font-semibold">{t("movements.matchingTitle")}</h3>
          {!props.sourceMovement.matches.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("movements.noMatches")}</p> : <ul className="space-y-2">{props.sourceMovement.matches.map(match => <li key={match.id} className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] p-3 text-sm">
            {match.source ? <Link href={`/finance/expected?item=${match.expected_item_id}`} className="font-medium underline underline-offset-2">{match.source.description ?? t("movements.matchedSourceUnavailable")}</Link> : <p className="font-medium">{t("movements.matchedSourceUnavailable")}</p>}
            {match.projectName ? <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{match.projectName}</p> : null}
            <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("movements.matchAmounts", { amount: money(match.amount, match.obligation_currency), paid: money(match.payment_amount, match.payment_currency), date: match.settlement_effective_date ? formatDateOnly(match.settlement_effective_date, locale) : "—" })}{match.released_allocation_id ? ` · ${t("movements.matchReleased")}` : ""}</p>
            {match.settlement_rate ? <p className="text-xs text-[var(--ui-text-muted)]">{t("movements.matchRate", { rate: match.settlement_rate, currency: match.payment_currency, obligation: match.obligation_currency, source: t(`movements.sources.${match.settlement_source ?? "manual"}`), date: match.settlement_effective_date ? formatDateOnly(match.settlement_effective_date, locale) : "—" })}</p> : null}
            {match.reason ? <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{match.reason}</p> : null}
          </li>)}</ul>}
        </section> : null}
      </div>
    </Dialog>
    <Dialog isOpen={editor !== null} className={props.expected ? "h-auto max-h-[calc(100dvh-1rem)] sm:max-w-[40rem]" : undefined} closeDisabled={pending} onRequestClose={() => {setEditor(null);if(props.expected)router.replace(props.returnHref??"/finance/expected");}} title={editor === "transfer" ? t("movements.transfer") : typeof editor === "object" && editor ? t("movements.refund") : t(props.expected ? "planning.recordPayment" : "movements.add")} closeLabel={t("movements.close")}>
      {editor !== null ? <div className={props.expected ? "min-h-0 overflow-y-auto p-4 sm:p-6" : "p-5"}><EntryForm data={props} today={props.today} transfer={editor === "transfer"} refund={typeof editor === "object" ? editor : undefined} expected={props.expected} defaultAccountId={props.defaultAccountId} projectCash={props.projectCash} onSaved={() => {setEditor(null);if(props.expected)router.push(props.returnHref??"/finance/expected");}} onPending={setPending} /></div> : null}
    </Dialog>
    <Dialog isOpen={reversing !== null} closeDisabled={pending} onRequestClose={() => setReversing(null)} title={t("movements.reverse")} closeLabel={t("movements.close")}>
      {reversing ? <div className="p-5"><FinanceActionForm action={saveFinanceMovement} label={t("movements.confirmReverse")} onSaved={() => setReversing(null)} onPending={setPending}>
        <input type="hidden" name="intent" value="reverse" /><input type="hidden" name="movementId" value={reversing.id} />
        <input type="hidden" name="date" value={reversing.financial_date}/>
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("movements.reversalHelp", { category: financeMovementCategoryLabel(reversing.category_id,reversing.category,props.categories,(key)=>t(`planning.defaults.${key}`)) })}</p>
        <FormField label={t("movements.reason")}><Textarea name="reason" maxLength={2000} required /></FormField>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" required className="mt-1 size-4" />{t("movements.reversalConfirm")}</label>
      </FinanceActionForm></div> : null}
    </Dialog>
  </div>;
}
