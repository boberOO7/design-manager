"use client";
import { useRef, useState, useTransition } from "react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { FinanceActionForm } from "./finance-action-form";
import { saveFinanceTrip } from "@/app/(app)/finance/trips/actions";
import { TripEntryEditor, type TripEntryEditorHandle } from "./trip-entry-editor";

type Foundation=NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
type Entry=FinanceTripData["entries"][number];
const numeric="tabular-nums text-right text-sm";
const quiet="text-xs text-[var(--ui-text-muted)]";
const cell="group/cell min-h-11 min-w-0 flex-1 cursor-pointer rounded-md bg-[var(--ui-surface-subtle)] px-2 py-1 text-right transition-[background-color,box-shadow,color] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-default disabled:opacity-60 sm:min-h-9 sm:w-full";

export function TripExpenseSheet({data,foundation,today}:{data:FinanceTripData;foundation:Foundation;today:string}) {
  const t=useTranslations("Finance.trips"),f=useTranslations("Finance"),locale=useLocale(),router=useRouter();
  const [expanded,setExpanded]=useState<string[]>([]);
  const [editor,setEditor]=useState<{kind:"plan"|"expense";expenseType:string;entry?:Entry}|null>(null);
  const [removing,setRemoving]=useState<Entry|null>(null),[pending,setPending]=useState(false);
  const [refreshing,startRefresh]=useTransition();
  const trigger=useRef<HTMLElement|null>(null),editorRef=useRef<TripEntryEditorHandle>(null);
  const base=foundation.currencies.find(c=>c.code===data.trip.reporting_currency);
  if(!base) return null;
  const money=(amount:string,currency=base.code)=>{const unit=foundation.currencies.find(c=>c.code===currency);return unit ? formatFinanceAmount(amount,unit,locale):`${amount} ${currency}`;};
  const live=data.entries.filter(e=>!e.reverses_id && !data.entries.some(r=>r.reverses_id===e.id) && (e.kind==="plan" || Number(e.net_amount)!==0));
  const empty=!live.some(e=>e.kind==="plan" || e.kind==="expense");
  const history=data.entries.filter(e=>!live.includes(e) && e.kind!=="advance");
  const toggle=(type:string)=>setExpanded(v=>v.includes(type)?v.filter(x=>x!==type):[...v,type]);
  const open=async(kind:"plan"|"expense",type:string,entry?:Entry)=>{
    if(editor?.kind===kind&&editor.expenseType===type&&editor.entry?.id===entry?.id)return;
    const nextTrigger=document.activeElement instanceof HTMLElement ? document.activeElement:null;
    if(editorRef.current&&!await editorRef.current.commit())return;
    trigger.current=nextTrigger;
    setEditor({kind,expenseType:type,entry});
  };
  const close=()=>{if(pending)return;setEditor(null);requestAnimationFrame(()=>trigger.current?.focus());};
  const saved=()=>{setEditor(null);setRemoving(null);startRefresh(()=>router.refresh());requestAnimationFrame(()=>trigger.current?.focus());};
  const committed=()=>startRefresh(()=>router.refresh());
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
    if(!entries.length)return <span className="inline-flex items-center justify-end gap-1.5 font-medium text-[var(--ui-text-secondary)]"><Plus className="size-3.5" aria-hidden="true"/>{t(kind==="plan"?"addPlan":"addExpense")}</span>;
    const total=reporting(entries,kind);
    return <span className="flex items-center justify-end gap-1.5"><span>{originals(entries,kind).map(v=><span className="block whitespace-nowrap" key={v.currency}>{money(v.amount,v.currency)}</span>)}{entries.some(e=>e.currency!==base.code)?<span className={`block ${quiet}`}>{total===null ? t("estimateUnavailable"):`≈ ${money(total)}`}</span>:null}</span>{kind==="plan"&&entries.length===1&&editable(entries[0])?<Pencil className="size-3.5 opacity-40 transition-opacity sm:opacity-0 sm:group-hover/cell:opacity-60 sm:group-focus-visible/cell:opacity-60" aria-hidden="true"/>:<Plus className="size-3.5 opacity-40 transition-opacity sm:opacity-0 sm:group-hover/cell:opacity-60 sm:group-focus-visible/cell:opacity-60" aria-hidden="true"/>}</span>;
  };
  return <section id="trip-expenses" aria-label={t("expenseSheet")} className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border)] px-4 py-2 sm:px-5"><h2 className="text-sm font-semibold">{t("expenseSheet")}</h2><span className={quiet}>{t("inlineHint")}</span></div>
    {empty?<EmptyState compact className="m-3 border-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] sm:m-4" title={t("emptyExpenseTitle")} action={<div className="flex flex-wrap items-center justify-center gap-1 text-sm text-[var(--ui-text-muted)]"><Button size="sm" variant="outline" disabled={data.trip.status==="cancelled"} onClick={()=>void open("plan","travel")}>{t("startPlanning")}</Button><span>{t("or")}</span><Button size="sm" variant="ghost" disabled={data.trip.status==="cancelled"} onClick={()=>void open("expense","travel")}>{t("addActualFromEmpty")}</Button></div>}/>:null}
    <div className="hidden grid-cols-[minmax(13rem,1.5fr)_1fr_1fr_1fr] gap-3 border-b border-[var(--ui-border)] px-5 py-2 text-xs font-medium text-[var(--ui-text-muted)] sm:grid"><span>{t("expenseType")}</span><span className="px-2 text-right">{t("plan")}</span><span className="px-2 text-right">{t("actual")}</span><span className="px-2 text-right">{t("variance")}</span></div>
    {tripExpenseTypes.map(type=>{
      const entries=live.filter(e=>e.expense_type===type && e.kind!=="advance"),plans=entries.filter(e=>e.kind==="plan"),actuals=entries.filter(e=>e.kind==="expense");
      const planTotal=reporting(plans,"plan"),actualTotal=reporting(actuals,"expense");
      const currencies=[...new Set(entries.map(e=>e.currency))];
      const unit=foundation.currencies.find(v=>v.code===currencies[0]);
      const difference=!plans.length || !actuals.length || planTotal===null || actualTotal===null ? null : currencies.length===1 && unit ? money(sumTripMoney([originals(actuals,"expense")[0].amount,`-${originals(plans,"plan")[0].amount}`],unit.minor_units),unit.code):`≈ ${money(sumTripMoney([actualTotal,`-${planTotal}`],base.minor_units))}`;
      const isOpen=expanded.includes(type),activeEditor=editor?.expenseType===type;
      const locked=data.trip.status==="cancelled" || refreshing;
      return <div key={type} data-expense-type={type} className={`border-b border-[var(--ui-border)] last:border-b-0 ${empty?"opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100":""}`}>
        <div className="grid grid-cols-1 items-center gap-x-2 px-3 py-2 sm:py-1 sm:grid-cols-[minmax(13rem,1.5fr)_1fr_1fr_1fr] sm:gap-x-3 sm:px-5">
          <button type="button" aria-label={`${t("details")} · ${t(`types.${type}`)}`} aria-expanded={isOpen} aria-controls={`trip-type-${type}`} disabled={!entries.length} onClick={()=>toggle(type)} className="col-span-1 flex min-h-11 items-center gap-2 rounded text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-default sm:col-span-1 sm:min-h-9"><ChevronDown className={`size-4 shrink-0 transition-transform duration-[220ms] motion-reduce:transition-none ${isOpen?"rotate-180":""} ${entries.length?"":"opacity-0"}`} aria-hidden="true"/>{t(`types.${type}`)}{actuals.length>1?<span className={quiet}>{actuals.length}</span>:null}</button>
          <div className={`${numeric} flex items-center justify-between gap-3 sm:block`}><span className={`block shrink-0 px-2 sm:hidden ${quiet}`}>{t("plan")}</span><button type="button" data-plan-trigger data-trip-editor-trigger aria-label={`${t("plan")} · ${t(`types.${type}`)}`} disabled={locked} className={cell} onClick={()=>void open("plan",type,plans.length===1&&editable(plans[0])?plans[0]:undefined)}>{amounts(plans,"plan")}</button></div>
          <div className={`${numeric} flex items-center justify-between gap-3 sm:block`}><span className={`block shrink-0 px-2 sm:hidden ${quiet}`}>{t("actual")}</span><button type="button" data-trip-editor-trigger className={cell} disabled={locked} aria-label={`${t("actual")} · ${t(`types.${type}`)}`} onClick={()=>void open("expense",type)}>{amounts(actuals,"expense")}</button></div>
          <div data-variance className={`${numeric} flex min-h-11 items-center justify-between gap-3 px-2 sm:min-h-9 sm:justify-end`}><span className={`block sm:hidden ${quiet}`}>{t("variance")}</span><span>{difference ?? "—"}</span></div>
        </div>
        <AnimatedFormContent id={`trip-type-${type}`} isOpen={isOpen}>
          <div className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-4 py-1.5 sm:px-5">
            <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">{entries.map(e=>{
              const accountId=data.entryPayments.find(v=>v.movement_id===e.movement_id)?.account_id;
              const payer=e.employee_id?data.travelers.find(v=>v.employee_id===e.employee_id)?.employee_name:e.kind==="expense"?foundation.accounts.find(v=>v.id===accountId)?.name ?? t("studioAccount"):"";
              return <div key={e.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-[var(--ui-border)] py-2">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{e.label || t(e.kind==="plan"?"plan":"actual")}</p><p className={`truncate ${quiet}`}>{[payer,formatDateOnly(e.financial_date ?? "",locale)].filter(Boolean).join(" · ")}</p>{e.daily_rate?<p className={`truncate ${quiet}`}>{t("calculation",{rate:e.daily_rate,currency:e.currency ?? "",days:e.day_count ?? 1,count:e.traveler_count ?? 1,total:e.amount})}</p>:null}</div>
                <div className="flex items-center gap-1"><span className={`${numeric} whitespace-nowrap font-medium`}>{money(e.kind==="plan"?e.amount:e.net_amount ?? "0",e.currency ?? base.code)}</span>{editable(e)?<Button size="sm" className="size-9 shrink-0 px-0" variant="ghost" disabled={locked} data-trip-editor-trigger aria-label={`${f("edit")} · ${e.label || t(`types.${type}`)} · ${t(e.kind==="plan"?"plan":"actual")}`} onClick={()=>void open(e.kind==="plan"?"plan":"expense",type,e)}><Pencil className="size-3.5"/></Button>:null}{e.movement_id?<Link className="rounded px-2 py-2 text-xs hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" href="/finance/movements">{t("paymentDetails")}</Link>:!editable(e)?<span className={quiet}>{t("planUsed")}</span>:null}{e.kind==="plan" && editable(e)?<Button size="sm" variant="ghost" disabled={locked} onClick={()=>setRemoving(e)}>{t("remove")}</Button>:null}</div>
              </div>;
            })}</div>
          </div>
        </AnimatedFormContent>
        <div onTransitionEnd={e=>{if(e.propertyName==="height" && activeEditor && (document.activeElement===document.body || document.activeElement===trigger.current))e.currentTarget.querySelector<HTMLInputElement>("[data-entry-focus]")?.focus();}}><AnimatedFormContent isOpen={activeEditor}>{activeEditor && editor?<TripEntryEditor ref={editorRef} key={`${editor.kind}-${editor.entry?.id ?? "new"}`} {...editor} data={data} foundation={foundation} today={today} onSaved={committed} onLeave={()=>setEditor(null)} onCancel={close} onPending={setPending}/>:null}</AnimatedFormContent></div>
      </div>;
    })}
    {history.length ? <AnimatedDisclosure title={t("changeHistory")} className="border-t border-[var(--ui-border)] px-5"><div className="pb-3">{history.map(e=><p key={e.id} className={`flex flex-wrap justify-between gap-2 py-1 ${quiet}`}><span>{t(`types.${e.expense_type}`)} · {e.note || t("updated")}</span><span>{money(e.amount,e.currency ?? base.code)}</span></p>)}</div></AnimatedDisclosure>:null}
    <Dialog isOpen={Boolean(removing)} onRequestClose={()=>{if(!pending)setRemoving(null);}} closeDisabled={pending} closeLabel={f("close")} title={t("removePlan")}>
      {removing?<FinanceActionForm className="space-y-4 p-5" action={saveFinanceTrip} onSaved={saved} onPending={setPending} label={t("remove")} cancelLabel={f("close")} onCancel={()=>setRemoving(null)}><input type="hidden" name="intent" value="correct"/><input type="hidden" name="tripId" value={data.trip.id ?? ""}/><input type="hidden" name="reversesId" value={removing.id ?? ""}/><input type="hidden" name="note" value="Trip plan removed"/><p className="text-sm">{t(`types.${removing.expense_type}`)} · {money(removing.amount,removing.currency ?? base.code)}</p></FinanceActionForm>:null}
    </Dialog>
  </section>;
}
