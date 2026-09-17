"use client";

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
      <FormField label={transfer ? t("movements.sentAmount") : t("movements.amount")}><Input name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required autoComplete="off" /></FormField>
      {transfer ? <><FormField label={t("movements.toAccount")}><Select name="destinationId" aria-label={t("movements.toAccount")} value={destinationId} onValueChange={setDestinationId} required>{accounts(accountId)}</Select></FormField><FormField label={t("movements.receivedAmount")}><Input name="receivedAmount" inputMode="decimal" value={sameCurrency ? amount : received} onChange={(event) => setReceived(event.target.value)} readOnly={sameCurrency} required autoComplete="off" /></FormField></> : null}
      <FormField label={t("movements.date")}><DatePicker name="date" aria-label={t("movements.date")} value={date} onValueChange={setDate} min={data.settings?.cutover_date} max={today} locale={locale} required /></FormField>
      {transfer ? <FormField label={t("movements.fee", { currency: source?.currency ?? "" })}><Input name="fee" inputMode="decimal" defaultValue="0" required /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("movements.feeHelp")}</span></FormField> : null}
    </div>
    {kind === "owner_withdrawal" ? <p className="text-sm text-[var(--ui-text-muted)]">{t("movements.ownerHelp")}</p> : null}
    {!transfer&&!refund?<FinanceCategorySelect categories={allowedCategories} direction={kind==="incoming"?"incoming":"outgoing"} owner={kind==="owner_withdrawal"} value={categoryId} onValueChange={setCategoryId}/>:null}
    {!transfer&&!refund&&!expected&&["incoming","outgoing"].includes(kind)?<label className="flex items-start gap-2 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" name="allocationIntent" value="true" className="mt-1 size-4"/><span>{t("movements.advanceForMatching")}<span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">{t("movements.advanceForMatchingHelp")}</span></span></label>:null}
    {source ? <FxFields key={source.currency} currency={source.currency} base={base} /> : null}
    {transfer && destination && !sameCurrency ? <FxFields key={destination.currency} currency={destination.currency} base={base} destination /> : null}
    <FormField label={t("movements.description")}><Textarea name="description" rows={2} maxLength={2000} /></FormField>
    <p className="text-xs text-[var(--ui-text-muted)]">{t("movements.historyHelp")}</p>
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
  const money = (amount: number, code: string) => {
    const currency = props.currencies.find((item) => item.code === code);
    return currency ? formatFinanceAmount(amount, currency, locale) : `${amount} ${code}`;
  };
  return <div className="mx-auto w-full max-w-4xl space-y-6">
    <PageHeader title={t("movements.title")} description={t("movements.descriptionText")} />
    {!ready ? <p className={`${panel} p-5 text-sm text-[var(--ui-text-secondary)]`}>{t("movements.setupRequired")} <Link className="underline" href="/finance">{t("movements.setupLink")}</Link></p> : <>
      <section aria-label={t("movements.recordedBalance")} className={`${panel} divide-y divide-[var(--ui-border)]`}>
        <h2 className="px-5 py-3 text-sm font-semibold">{t("movements.recordedBalance")}</h2>
        {props.balances.map((balance) => <div key={balance.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"><span>{balance.name}{balance.archived_at ? <span className="ml-2 text-xs text-[var(--ui-text-muted)]">{t("movements.archived")}</span> : null}</span><span className="ui-numeric font-medium">{balance.recorded_balance !== null && balance.currency ? money(balance.recorded_balance, balance.currency) : "—"}</span></div>)}
      </section>
      <div className="flex flex-wrap gap-2"><Button disabled={!active.length} onClick={() => setEditor("incoming")}>{t("movements.add")}</Button><Button variant="outline" disabled={active.length<2} onClick={() => setEditor("transfer")}>{t("movements.transfer")}</Button></div>
    </>}
    <section aria-label={t("movements.history")} className={panel}>
      {props.movements.length ? <ul className="divide-y divide-[var(--ui-border)]">{props.movements.map((movement) => {
        const reversed = movement.reversed;
        const primary = movement.entries.find((entry) => entry.entry_role === "primary");
        const activeOriginalAccount = active.some((account) => account.id === primary?.account_id);
        const category=financeMovementCategoryLabel(movement.category_id,movement.category,props.categories,(key)=>t(`planning.defaults.${key}`));
        return <li key={movement.id} className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-[var(--ui-text)]">{category}</p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{formatDateOnly(movement.financial_date, locale)} · {t(`movements.kinds.${movement.kind}`)} · {t(`movements.natures.${movement.nature}`)}{reversed ? ` · ${t("movements.reversed")}` : ""}</p></div><div className="space-y-1 text-right text-sm">{movement.entries.map((entry) => <p key={entry.id}><span className="text-[var(--ui-text-secondary)]">{props.accounts.find((account) => account.id === entry.account_id)?.name} {entry.entry_role === "fee" ? `(${t("movements.feeShort")})` : ""}</span> <span className="ui-numeric font-medium">{money(entry.amount,entry.currency)}</span></p>)}</div></div>
          {movement.description ? <p className="whitespace-pre-wrap break-words text-sm text-[var(--ui-text-secondary)]">{movement.description}</p> : null}
          <details><summary className="cursor-pointer text-xs text-[var(--ui-text-secondary)]">{t("movements.valuationDetails")}</summary><div className="mt-2 space-y-2 text-xs text-[var(--ui-text-muted)]"><p>{t("movements.reference")}: {movement.id}{movement.related_movement_id ? <> · {t("movements.relatedReference")}: {movement.related_movement_id}</> : null}</p>{movement.entries.map((entry) => <p key={entry.id}>{money(entry.amount,entry.currency)} → {money(entry.reporting_amount,entry.reporting_currency)} · 1 {entry.currency} = {entry.fx_rate} {entry.reporting_currency} · {t(`movements.sources.${entry.fx_source}`)} · {formatDateOnly(entry.fx_effective_date,locale)}</p>)}</div></details>
          {!reversed && movement.kind !== "reversal" ? <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => { setReversalDate(props.today); setReversing(movement); }}>{t("movements.reverse")}</Button>{["incoming","outgoing"].includes(movement.kind) && activeOriginalAccount ? <Button variant="ghost" onClick={() => setEditor(movement)}>{t("movements.refund")}</Button> : null}</div> : null}
        </li>;
      })}</ul> : <p className="p-5 text-sm text-[var(--ui-text-muted)]">{t("movements.empty")}</p>}
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
