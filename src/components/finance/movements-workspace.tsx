"use client";

import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceMovement } from "@/app/(app)/finance/movements/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { formatDateOnly } from "@/lib/utils";
import { formatFinanceAmount } from "@/lib/finance";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCategorySelect } from "./category-select";
import type { FinanceExpected } from "@/lib/finance-planning";
import { financeMovementCategoryLabel } from "@/lib/finance-planning";
import type { getFinanceData, FinanceMovementWithEntries } from "@/data/queries/finance";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";

function FxFields({ currency, base, destination = false }: { currency: string; base: string; destination?: boolean }) {
  const t = useTranslations("Finance");
  const [mode, setMode] = useState(base === "UAH" ? "nbu" : "manual");
  if (currency === base || !currency) return null;
  return <div className="space-y-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3">
    <FormField label={t("movements.valuation", { currency, base })}>
      <Select aria-label={t("movements.valuation", { currency, base })} name={destination ? "destinationFxMode" : "fxMode"} value={mode} onValueChange={setMode}>
        {base === "UAH" ? <SelectItem value="nbu">{t("movements.nbu")}</SelectItem> : null}
        <SelectItem value="manual">{t("movements.manual")}</SelectItem>
      </Select>
    </FormField>
    {mode === "manual" ? <FormField label={t("movements.rate", { currency, base })}><Input name={destination ? "destinationManualRate" : "manualRate"} inputMode="decimal" required autoComplete="off" /></FormField> : <p className="text-sm text-[var(--ui-text-muted)]">{t("movements.nbuHelp")}</p>}
  </div>;
}

function EntryForm({ data, today, transfer, refund, expected, onSaved, onPending }: { data: Foundation; today: string; transfer: boolean; refund?: FinanceMovementWithEntries; expected?:FinanceExpected|null; onSaved: () => void; onPending: (pending: boolean) => void }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const active = data.accounts.filter((account) => !account.archived_at && (!expected || account.currency===expected.currency));
  const originalAccount = refund?.entries.find((entry) => entry.entry_role === "primary")?.account_id;
  const expectedCategory=data.categories.find((category)=>category.id===expected?.category_id);
  const [kind, setKind] = useState(refund ? "refund" : transfer ? "transfer" : expectedCategory?.nature === "owner_distribution" ? "owner_withdrawal" : expected?.direction??"incoming");
  const allowedCategories=expected?data.categories.filter((category)=>category.nature===expectedCategory?.nature):data.categories;
  const [categoryId,setCategoryId]=useState(expectedCategory&&!expectedCategory.archived_at?expectedCategory.id:"");
  const [accountId, setAccountId] = useState(originalAccount ?? active[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState(active.find((account) => account.id !== accountId)?.id ?? "");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(expected?.remaining_amount?.toString()??"");
  const [received, setReceived] = useState("");
  const source = active.find((account) => account.id === accountId);
  const destination = active.find((account) => account.id === destinationId);
  const base = data.settings?.base_currency ?? "";
  const sameCurrency = source?.currency === destination?.currency;
  const refundCategory=refund?financeMovementCategoryLabel(refund.category_id,refund.category,data.categories,(key)=>t(`planning.defaults.${key}`)):"";
  const accounts = (exclude?: string) => active.filter((account) => account.id !== exclude).map((account) => <SelectItem key={account.id} value={account.id}>{account.name} · {account.currency}</SelectItem>);
  return <FinanceActionForm action={saveFinanceMovement} onSaved={onSaved} onPending={onPending} label={t("movements.record")}>
    {transfer || refund || expected ? <input type="hidden" name="kind" value={kind} /> : <FormField label={t("movements.type")}><Select name="kind" aria-label={t("movements.type")} value={kind} onValueChange={(value)=>{setKind(value);setCategoryId("");}}>{["incoming","outgoing","owner_withdrawal"].map((value) => <SelectItem key={value} value={value}>{t(`movements.kinds.${value}`)}</SelectItem>)}</Select></FormField>}
    {expected?<><input type="hidden" name="expectedItemId" value={expected.id??""}/><p className="text-sm text-[var(--ui-text-secondary)]">{t("planning.recordFor",{ item:expected.description??"",currency:expected.currency??"" })}</p><FormField label={t("planning.allocateAmount")}><Input name="allocationAmount" inputMode="decimal" defaultValue={expected.remaining_amount??""} required/></FormField></>:null}
    {refund ? <><input type="hidden" name="relatedMovementId" value={refund.id} /><p className="text-sm text-[var(--ui-text-secondary)]">{t("movements.refundHelp", { category: refundCategory })}</p></> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label={transfer ? t("movements.fromAccount") : t("movements.account")}>{refund ? <><Input value={source ? `${source.name} · ${source.currency}` : t("movements.errors.archived")} readOnly /><input type="hidden" name="accountId" value={accountId} /></> : <Select name="accountId" aria-label={transfer ? t("movements.fromAccount") : t("movements.account")} value={accountId} onValueChange={setAccountId} required>{accounts()}</Select>}</FormField>
      {transfer ? <FormField label={t("movements.toAccount")}><Select name="destinationId" aria-label={t("movements.toAccount")} value={destinationId} onValueChange={setDestinationId} required>{accounts(accountId)}</Select></FormField> : null}
      <FormField label={transfer ? t("movements.sentAmount") : t("movements.amount")}><Input name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required autoComplete="off" /></FormField>
      {transfer ? sameCurrency ? <input type="hidden" name="receivedAmount" value={amount}/> : <FormField label={t("movements.receivedAmount")}><Input name="receivedAmount" inputMode="decimal" value={received} onChange={(event) => setReceived(event.target.value)} required autoComplete="off" /></FormField> : null}
      <FormField label={t("movements.date")}><DatePicker name="date" aria-label={t("movements.date")} value={date} onValueChange={setDate} min={data.settings?.cutover_date} max={today} locale={locale} required /></FormField>
    </div>
    {kind === "owner_withdrawal" ? <p className="text-sm text-[var(--ui-text-muted)]">{t("movements.ownerHelp")}</p> : null}
    {!transfer&&!refund?<FinanceCategorySelect categories={allowedCategories} direction={kind==="incoming"?"incoming":"outgoing"} owner={kind==="owner_withdrawal"} value={categoryId} onValueChange={setCategoryId}/>:null}
    {(source?.currency !== base || transfer && destination?.currency !== base && !sameCurrency) ? <div className="space-y-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3"><p className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("movements.reportingDetails")}</p><div className="grid gap-3 sm:grid-cols-2">{source ? <FxFields key={source.currency} currency={source.currency} base={base} /> : null}{transfer && destination && !sameCurrency ? <FxFields key={destination.currency} currency={destination.currency} base={base} destination /> : null}</div></div> : null}
    <details className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)]"><summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("movements.additionalDetails")}</summary><div className="space-y-4 border-t border-[var(--ui-border)] p-3">
      {transfer ? <FormField label={t("movements.fee", { currency: source?.currency ?? "" })}><Input name="fee" inputMode="decimal" defaultValue="0" required /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("movements.feeHelp")}</span></FormField> : null}
      {!transfer&&!refund&&!expected&&["incoming","outgoing"].includes(kind)?<label className="flex items-start gap-2 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" name="allocationIntent" value="true" className="mt-1 size-4"/><span>{t("movements.advanceForMatching")}<span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">{t("movements.advanceForMatchingHelp")}</span></span></label>:null}
      <FormField label={t("movements.description")}><Textarea name="description" rows={2} maxLength={2000} /></FormField>
      <p className="text-xs text-[var(--ui-text-muted)]">{t("movements.historyHelp")}</p>
    </div></details>
  </FinanceActionForm>;
}

export function FinanceMovementsWorkspace(props: Foundation & { movements: FinanceMovementWithEntries[]; total: number; page: number; today: string; expected?:FinanceExpected|null; returnHref?:string }) {
  const t = useTranslations("Finance");
  const locale = useLocale();
  const router=useRouter();
  const [editor, setEditor] = useState<"incoming" | "transfer" | FinanceMovementWithEntries | null>(props.expected?"incoming":null);
  const [reversing, setReversing] = useState<FinanceMovementWithEntries | null>(null);
  const [pending, setPending] = useState(false);
  const [reversalDate, setReversalDate] = useState(props.today);
  const ready = Boolean(props.settings?.finalized_at);
  const active = props.accounts.filter((account) => !account.archived_at);
  const money = (amount: number | string, code: string) => {
    const currency = props.currencies.find((item) => item.code === code);
    return currency ? formatFinanceAmount(amount, currency, locale) : `${amount} ${code}`;
  };
  return <div className="mx-auto w-full max-w-7xl space-y-6">
    <PageHeader title={t("movements.title")} description={t("movements.descriptionText")} />
    {!ready ? <p className={`${panel} p-5 text-sm text-[var(--ui-text-secondary)]`}>{t("movements.setupRequired")} <Link className="underline" href="/finance/accounts">{t("movements.setupLink")}</Link></p> : <>
      <section aria-label={t("movements.recordedBalance")} className={panel}>
        <h2 className="px-5 py-3 text-sm font-semibold">{t("movements.recordedBalance")}</h2>
        <div className="grid border-t border-[var(--ui-border)] sm:grid-cols-2 xl:grid-cols-4">{props.balances.map((balance) => <div key={balance.id} className="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--ui-border)] px-5 py-2.5 text-sm last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0"><span className="min-w-0 truncate">{balance.name}{balance.archived_at ? <span className="ml-2 text-xs text-[var(--ui-text-muted)]">{t("movements.archived")}</span> : null}</span><span className="ui-numeric shrink-0 font-medium">{balance.recorded_balance !== null && balance.currency ? money(balance.recorded_balance, balance.currency) : "—"}</span></div>)}</div>
      </section>
      <div className="flex flex-wrap gap-2"><Button className="gap-2" disabled={!active.length} onClick={() => setEditor("incoming")}><Plus className="size-4" aria-hidden="true"/>{t("movements.add")}</Button><Button variant="outline" disabled={active.length<2} onClick={() => setEditor("transfer")}>{t("movements.transfer")}</Button></div>
    </>}
    <section aria-label={t("movements.history")} className={`${panel} overflow-hidden`}>
      {props.movements.length ? <><div aria-hidden="true" className="hidden min-h-10 grid-cols-[7rem_minmax(12rem,1.5fr)_minmax(10rem,1fr)_minmax(8rem,.8fr)_minmax(10rem,auto)_1.5rem] items-center gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-4 text-xs font-medium text-[var(--ui-text-muted)] lg:grid"><span>{t("movements.date")}</span><span>{t("movements.ledgerTitle")}</span><span>{t("movements.account")}</span><span>{t("movements.type")}</span><span className="text-right">{t("movements.amount")}</span><span/></div><ul className="divide-y divide-[var(--ui-border)]">{props.movements.map((movement) => {
        const reversed = movement.reversed;
        const primary = movement.entries.find((entry) => entry.entry_role === "primary");
        const destination = movement.entries.find((entry) => entry.entry_role === "destination");
        const activeOriginalAccount = active.some((account) => account.id === primary?.account_id);
        const category=financeMovementCategoryLabel(movement.category_id,movement.category,props.categories,(key)=>t(`planning.defaults.${key}`));
        const title=movement.description || (movement.kind==="transfer"?t("movements.kinds.transfer"):category);
        const accountName=(id?:string)=>props.accounts.find((account)=>account.id===id)?.name??"—";
        const accountText=movement.kind==="transfer"?`${accountName(primary?.account_id)} → ${accountName(destination?.account_id)}`:accountName(primary?.account_id);
        const displayMoney=(entry:typeof primary)=>{if(!entry)return "—";const formatted=money(entry.amount,entry.currency);return Number(entry.amount)>0?`+${formatted}`:formatted;};
        const absoluteMoney=(entry:typeof primary)=>entry?money(String(entry.amount).replace(/^-/,""),entry.currency):"—";
        const sameCurrencyTransfer=movement.kind==="transfer"&&primary?.currency===destination?.currency;
        const amountTone=movement.nature==="transfer"?"text-[var(--ui-text)]":Number(primary?.amount??0)>0?"text-[var(--ui-success-text)]":"text-[var(--ui-danger-text)]";
        return <li key={movement.id}><details className="group"><summary aria-label={t("movements.detailsNamed",{name:title})} className="grid min-h-16 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_1.25rem] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none lg:min-h-12 lg:grid-cols-[7rem_minmax(12rem,1.5fr)_minmax(10rem,1fr)_minmax(8rem,.8fr)_minmax(10rem,auto)_1.5rem] lg:py-2">
          <span className="col-start-1 row-start-2 text-xs text-[var(--ui-text-muted)] lg:col-start-1 lg:row-start-1">{formatDateOnly(movement.financial_date, locale)}<span className="lg:hidden"> · {t(`movements.kinds.${movement.kind}`)}</span></span>
          <span className="col-start-1 row-start-1 min-w-0 truncate text-sm font-medium text-[var(--ui-text)] lg:col-start-2">{title}{reversed ? <span className="ml-2 rounded-full bg-[var(--ui-surface-muted)] px-2 py-0.5 text-xs font-normal text-[var(--ui-text-muted)]">{t("movements.reversed")}</span> : null}</span>
          <span className="col-start-1 row-start-3 min-w-0 truncate text-xs text-[var(--ui-text-secondary)] lg:col-start-3 lg:row-start-1 lg:text-sm">{accountText}</span>
          <span className="hidden text-xs text-[var(--ui-text-secondary)] lg:col-start-4 lg:block">{t(`movements.kinds.${movement.kind}`)} · {t(`movements.natures.${movement.nature}`)}</span>
          <span className={`ui-numeric col-start-2 row-span-3 row-start-1 whitespace-nowrap text-right text-sm font-semibold lg:col-start-5 lg:row-span-1 ${amountTone}`}>{movement.kind==="transfer"?(sameCurrencyTransfer?absoluteMoney(primary):`${absoluteMoney(primary)} → ${absoluteMoney(destination)}`):displayMoney(primary)}</span>
          <ChevronDown className="col-start-3 row-span-3 row-start-1 size-4 text-[var(--ui-text-muted)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none lg:col-start-6 lg:row-span-1" aria-hidden="true"/>
        </summary><div className="space-y-3 border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-4 py-3 text-sm">
          {title !== category ? <p className="text-[var(--ui-text-secondary)]">{category}</p> : null}
          <div className="space-y-1 text-xs text-[var(--ui-text-muted)]">{movement.entries.map((entry) => <p key={entry.id}>{accountName(entry.account_id)}{entry.entry_role === "fee" ? ` (${t("movements.feeShort")})` : ""}: {displayMoney(entry)}{entry.currency!==entry.reporting_currency?` ≈ ${money(entry.reporting_amount,entry.reporting_currency)} · ${t(`movements.sources.${entry.fx_source}`)} ${entry.fx_rate} · ${formatDateOnly(entry.fx_effective_date,locale)}`:""}</p>)}</div>
          {!reversed && movement.kind !== "reversal" ? <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => { setReversalDate(props.today); setReversing(movement); }}>{t("movements.reverse")}</Button>{["incoming","outgoing"].includes(movement.kind) && activeOriginalAccount ? <Button variant="ghost" onClick={() => setEditor(movement)}>{t("movements.refund")}</Button> : null}</div> : null}
        </div></details></li>;
      })}</ul></> : <p className="p-5 text-sm text-[var(--ui-text-muted)]">{t("movements.empty")}</p>}
    </section>
    <nav aria-label={t("movements.pages")} className="flex justify-between text-sm">{props.page>1 ? <Link href={`/finance/movements?page=${props.page-1}`} className="underline">{t("movements.previous")}</Link> : <span />}{props.page*50<props.total ? <Link href={`/finance/movements?page=${props.page+1}`} className="underline">{t("movements.next")}</Link> : null}</nav>
    <Dialog isOpen={editor !== null} closeDisabled={pending} onRequestClose={() => {setEditor(null);if(props.expected)router.replace(props.returnHref??"/finance/expected");}} title={editor === "transfer" ? t("movements.transfer") : typeof editor === "object" && editor ? t("movements.refund") : t("movements.add")} closeLabel={t("movements.close")}>
      {editor !== null ? <div className="p-5"><EntryForm data={props} today={props.today} transfer={editor === "transfer"} refund={typeof editor === "object" ? editor : undefined} expected={props.expected} onSaved={() => {setEditor(null);if(props.expected)router.push(props.returnHref??"/finance/expected");}} onPending={setPending} /></div> : null}
    </Dialog>
    <Dialog isOpen={reversing !== null} closeDisabled={pending} onRequestClose={() => setReversing(null)} title={t("movements.reverse")} closeLabel={t("movements.close")}>
      {reversing ? <div className="p-5"><FinanceActionForm action={saveFinanceMovement} label={t("movements.confirmReverse")} onSaved={() => setReversing(null)} onPending={setPending}>
        <input type="hidden" name="intent" value="reverse" /><input type="hidden" name="movementId" value={reversing.id} />
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("movements.reversalHelp", { category: financeMovementCategoryLabel(reversing.category_id,reversing.category,props.categories,(key)=>t(`planning.defaults.${key}`)) })}</p>
        <FormField label={t("movements.date")}><DatePicker name="date" aria-label={t("movements.date")} min={reversing.financial_date} max={props.today} value={reversalDate} onValueChange={setReversalDate} locale={locale} required /></FormField>
        <FormField label={t("movements.reason")}><Textarea name="reason" maxLength={2000} required /></FormField>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" required className="mt-1 size-4" />{t("movements.reversalConfirm")}</label>
      </FinanceActionForm></div> : null}
    </Dialog>
  </div>;
}
