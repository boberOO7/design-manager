"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { ChevronDown, Plus, Pencil } from "lucide-react";
import type { getFinanceData } from "@/data/queries/finance";
import type { FinanceTripData } from "@/data/queries/finance-trips";
import { sumTripMoney, tripExpenseTypes } from "@/lib/finance-trips";
import { formatFinanceAmount } from "@/lib/finance";
import { formatDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { Dialog } from "@/components/ui/dialog";
import { FinanceActionForm } from "./finance-action-form";
import { saveFinanceTrip } from "@/app/(app)/finance/trips/actions";
import { TripEntryEditor } from "./trip-entry-editor";

type Foundation=NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
type Entry=FinanceTripData["entries"][number];
const numeric="tabular-nums text-right text-sm";
const quiet="text-xs text-[var(--ui-text-muted)]";
const cell="min-h-11 min-w-0 flex-1 sm:min-h-9 sm:w-full rounded px-2 py-1 text-right transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-default disabled:opacity-60";

export function TripExpenseSheet({data,foundation,today}:{data:FinanceTripData;foundation:Foundation;today:string}) {
  const t=useTranslations("Finance.trips"),f=useTranslations("Finance"),locale=useLocale(),router=useRouter();
  const [expanded,setExpanded]=useState<string[]>([]);
  const [editor,setEditor]=useState<{kind:"plan"|"expense";expenseType:string;entry?:Entry}|null>(null);
  const [removing,setRemoving]=useState<Entry|null>(null),[pending,setPending]=useState(false);
  const trigger=useRef<HTMLElement|null>(null);
  const base=foundation.currencies.find(c=>c.code===data.trip.reporting_currency);
  if(!base) return null;
  const money=(amount:string,currency=base.code)=>{const unit=foundation.currencies.find(c=>c.code===currency);return unit ? formatFinanceAmount(amount,unit,locale):`${amount} ${currency}`;};
  const live=data.entries.filter(e=>!e.reverses_id && !data.entries.some(r=>r.reverses_id===e.id) && (e.kind==="plan" || Number(e.net_amount)!==0));
  const history=data.entries.filter(e=>!live.includes(e) && e.kind!=="advance");
  const toggle=(type:string)=>setExpanded(v=>v.includes(type)?v.filter(x=>x!==type):[...v,type]);
  const open=(kind:"plan"|"expense",type:string,entry?:Entry)=>{trigger.current=document.activeElement instanceof HTMLElement ? document.activeElement:null;setEditor({kind,expenseType:type,entry});};
  const close=()=>{if(pending)return;setEditor(null);requestAnimationFrame(()=>trigger.current?.focus());};
  const saved=()=>{setEditor(null);setRemoving(null);router.refresh();requestAnimationFrame(()=>trigger.current?.focus());};
  const editable=(entry:Entry)=>!data.entries.some(e=>e.plan_id===entry.id) && !(entry.kind==="plan" && data.payments.some(p=>p.planId===entry.id)) && (entry.kind==="plan" || !entry.movement_id || Number(entry.net_amount)===Number(entry.amount));
  const originals=(entries:Entry[],kind:"plan"|"expense")=>[...new Set(entries.flatMap(e=>e.currency?[e.currency]:[]))].map(currency=>{
    const digits=foundation.currencies.find(c=>c.code===currency)?.minor_units ?? 2;
    return {currency,amount:sumTripMoney(entries.filter(e=>e.currency===currency).map(e=>kind==="plan"?e.amount:e.net_amount ?? "0"),digits)};
  });
  const reporting=(entries:Entry[],kind:"plan"|"expense")=>{
    const values=entries.map(e=>kind==="plan"?data.estimates.values[e.id ?? ""]:e.net_reporting_amount);
    return values.some(v=>v==null)?null:sumTripMoney(values.map(v=>v ?? "0"),base.minor_units);
  };
  const amounts=(entries:Entry[],kind:"plan"|"expense")=>{
    if(!entries.length)return <span className="text-[var(--ui-text-muted)]">—</span>;
    const total=reporting(entries,kind);
    return <>{originals(entries,kind).map(v=><span className="block whitespace-nowrap" key={v.currency}>{money(v.amount,v.currency)}</span>)}{entries.some(e=>e.currency!==base.code)?<span className={`block ${quiet}`}>{total===null ? t("estimateUnavailable"):`≈ ${money(total)}`}</span>:null}</>;
  };
  return <section id="trip-expenses" aria-label={t("expenseSheet")} className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border)] px-4 py-2 sm:px-5"><h2 className="text-sm font-semibold">{t("expenseSheet")}</h2><span className={quiet}>{t("inlineHint")}</span></div>
    <div className="hidden grid-cols-[minmax(13rem,1.5fr)_1fr_1fr_1fr] gap-3 border-b border-[var(--ui-border)] px-5 py-2 text-xs font-medium text-[var(--ui-text-muted)] sm:grid"><span>{t("expenseType")}</span><span className="px-2 text-right">{t("plan")}</span><span className="pr-12 text-right">{t("actual")}</span><span className="px-2 text-right">{t("variance")}</span></div>
    {tripExpenseTypes.map(type=>{
      const entries=live.filter(e=>e.expense_type===type && e.kind!=="advance"),plans=entries.filter(e=>e.kind==="plan"),actuals=entries.filter(e=>e.kind==="expense");
      const planTotal=reporting(plans,"plan"),actualTotal=reporting(actuals,"expense");
      const currencies=[...new Set(entries.map(e=>e.currency))];
      const unit=foundation.currencies.find(v=>v.code===currencies[0]);
      const difference=!plans.length || !actuals.length || planTotal===null || actualTotal===null ? null : currencies.length===1 && unit ? money(sumTripMoney([originals(actuals,"expense")[0].amount,`-${originals(plans,"plan")[0].amount}`],unit.minor_units),unit.code):`≈ ${money(sumTripMoney([actualTotal,`-${planTotal}`],base.minor_units))}`;
      const isOpen=expanded.includes(type),activeEditor=editor?.expenseType===type;
      const locked=data.trip.status==="cancelled" || Boolean(editor);
      return <div key={type} data-expense-type={type} className="border-b border-[var(--ui-border)] last:border-b-0">
        <div className="grid grid-cols-1 items-center gap-x-2 px-3 py-2 sm:py-1 sm:grid-cols-[minmax(13rem,1.5fr)_1fr_1fr_1fr] sm:gap-x-3 sm:px-5">
          <button type="button" aria-expanded={isOpen} aria-controls={`trip-type-${type}`} onClick={()=>toggle(type)} className="col-span-1 flex min-h-11 sm:min-h-9 items-center gap-2 rounded text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:col-span-1"><ChevronDown className={`size-4 shrink-0 transition-transform duration-[220ms] motion-reduce:transition-none ${isOpen?"rotate-180":""}`} aria-hidden="true"/>{t(`types.${type}`)}{actuals.length>1?<span className={quiet}>{actuals.length}</span>:null}</button>
          <div className={`${numeric} flex items-center justify-between gap-3 sm:block`}><span className={`block shrink-0 px-2 sm:hidden ${quiet}`}>{t("plan")}</span><button type="button" data-plan-trigger aria-label={`${t("plan")} · ${t(`types.${type}`)}`} disabled={locked} className={cell} onClick={()=>plans.length>1 || plans.length===1 && !editable(plans[0]) ? toggle(type):open("plan",type,plans[0])}>{amounts(plans,"plan")}</button></div>
          <div className={`${numeric} flex items-center justify-between gap-3 sm:block`}><span className={`block shrink-0 px-2 sm:hidden ${quiet}`}>{t("actual")}</span><div className="flex items-center justify-end"><button type="button" className={cell} aria-label={`${t("details")} · ${t(`types.${type}`)}`} onClick={()=>toggle(type)}>{amounts(actuals,"expense")}</button><Button size="sm" className="size-11 shrink-0 px-0 sm:size-9" variant="ghost" disabled={locked} aria-label={`${t("addExpense")} · ${t(`types.${type}`)}`} onClick={()=>open("expense",type)}><Plus className="size-4"/></Button></div></div>
          <div className={`${numeric} flex min-h-9 items-center justify-between gap-3 px-2 sm:block`}><span className={`block sm:hidden ${quiet}`}>{t("variance")}</span><span>{difference ?? "—"}</span></div>
        </div>
        {plans.find(e=>e.daily_rate)?<p className={`${quiet} px-5 pb-2 sm:pl-11`}>{plans.filter(e=>e.daily_rate).map(e=>t("calculation",{rate:e.daily_rate ?? "",currency:e.currency ?? "",days:e.day_count ?? 1,count:e.traveler_count ?? 1,total:e.amount})).join(" · ")}</p>:null}
        <AnimatedFormContent id={`trip-type-${type}`} isOpen={isOpen}>
          <div className="border-t border-[var(--ui-border)] px-4 py-1 sm:px-5">
            {entries.map(e=><div key={e.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--ui-border)] py-1 last:border-b-0"><div className="min-w-0 text-sm"><span>{e.label || t(`types.${type}`)}</span><span className={`ml-2 ${quiet}`}>{t(e.kind==="plan"?"plan":"actual")} · {e.employee_id ? data.travelers.find(v=>v.employee_id===e.employee_id)?.employee_name : e.kind==="expense"?t("studioAccount"):""} {formatDateOnly(e.financial_date ?? "",locale)}</span></div><div className="flex flex-wrap items-center gap-2"><span className={numeric}>{money(e.kind==="plan"?e.amount:e.net_amount ?? "0",e.currency ?? base.code)}</span>{editable(e)?<Button size="sm" className="size-11 shrink-0 px-0 sm:size-9" variant="ghost" disabled={locked} aria-label={`${f("edit")} · ${e.label || t(`types.${type}`)} · ${t(e.kind==="plan"?"plan":"actual")}`} onClick={()=>open(e.kind==="plan"?"plan":"expense",type,e)}><Pencil className="size-3.5"/></Button>:null}{e.movement_id?<Link className="rounded px-2 py-3 text-xs focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" href="/finance/movements">{t("paymentDetails")}</Link>:!editable(e)?<span className={quiet}>{t("planUsed")}</span>:null}{e.kind==="plan" && editable(e)?<Button size="sm" variant="ghost" disabled={locked} onClick={()=>setRemoving(e)}>{t("remove")}</Button>:null}</div></div>)}
            <div className="flex gap-2 py-1"><Button size="sm" variant="ghost" disabled={locked} onClick={()=>open("plan",type)}><Plus className="mr-1 size-3.5"/>{t("addPlan")}</Button><Button size="sm" variant="ghost" disabled={locked} onClick={()=>open("expense",type)}><Plus className="mr-1 size-3.5"/>{t("addExpense")}</Button></div>
          </div>
        </AnimatedFormContent>
        <div onTransitionEnd={e=>{if(e.propertyName==="height" && activeEditor && document.activeElement===document.body)e.currentTarget.querySelector<HTMLInputElement>("[data-entry-focus]")?.focus();}}><AnimatedFormContent isOpen={activeEditor}>{activeEditor && editor?<TripEntryEditor key={`${editor.kind}-${editor.entry?.id ?? "new"}`} {...editor} data={data} foundation={foundation} today={today} onSaved={saved} onCancel={close} onPending={setPending}/>:null}</AnimatedFormContent></div>
      </div>;
    })}
    {history.length ? <AnimatedDisclosure title={t("changeHistory")} className="border-t border-[var(--ui-border)] px-5"><div className="pb-3">{history.map(e=><p key={e.id} className={`flex flex-wrap justify-between gap-2 py-1 ${quiet}`}><span>{t(`types.${e.expense_type}`)} · {e.note || t("updated")}</span><span>{money(e.amount,e.currency ?? base.code)}</span></p>)}</div></AnimatedDisclosure>:null}
    <Dialog isOpen={Boolean(removing)} onRequestClose={()=>{if(!pending)setRemoving(null);}} closeDisabled={pending} closeLabel={f("close")} title={t("removePlan")}>
      {removing?<FinanceActionForm className="space-y-4 p-5" action={saveFinanceTrip} onSaved={saved} onPending={setPending} label={t("remove")} cancelLabel={f("close")} onCancel={()=>setRemoving(null)}><input type="hidden" name="intent" value="correct"/><input type="hidden" name="tripId" value={data.trip.id ?? ""}/><input type="hidden" name="reversesId" value={removing.id ?? ""}/><input type="hidden" name="note" value="Trip plan removed"/><p className="text-sm">{t(`types.${removing.expense_type}`)} · {money(removing.amount,removing.currency ?? base.code)}</p></FinanceActionForm>:null}
    </Dialog>
  </section>;
}
