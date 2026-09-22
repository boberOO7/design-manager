"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { saveFinanceTrip } from "@/app/(app)/finance/trips/actions";
import { getProjectReferenceRate } from "@/app/(app)/finance/project-actions";
import type { getFinanceData } from "@/data/queries/finance";
import type { FinanceTripData } from "@/data/queries/finance-trips";
import { tripDays, tripEntrySchema, tripPerDiem } from "@/lib/finance-trips";
import { projectReferenceValue } from "@/lib/finance-project-plan";
import type { FinanceActionState } from "@/lib/finance";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";
import { FinanceFxFields } from "./finance-fx-fields";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
type Entry = FinanceTripData["entries"][number];
const quiet = "text-xs text-[var(--ui-text-muted)]";

export type TripEntryEditorHandle={commit:()=>Promise<boolean>};
function snapshot(form:HTMLFormElement){return JSON.stringify([...new FormData(form)].map(([key,value])=>[key,String(value)]));}
function isEditorInteraction(root:HTMLElement,event:Event){
  const path=event.composedPath();
  if(path.some(node=>isEditorTarget(root,node)))return true;
  return isEditorTarget(root,event.target);
}
function isEditorTarget(root:HTMLElement,target:EventTarget|null){
  if(!(target instanceof Node))return false;
  if(root.contains(target))return true;
  const controlled=new Set([...root.querySelectorAll<HTMLElement>("[aria-controls]")].flatMap(node=>(node.getAttribute("aria-controls")??"").split(/\s+/).filter(Boolean)));
  if(target instanceof HTMLElement&&controlled.has(target.id))return true;
  return [...controlled].some(id=>{
    const content=document.getElementById(id);
    return Boolean(content&&(content.contains(target)||content.parentElement?.contains(target)));
  });
}

export const TripEntryEditor=forwardRef<TripEntryEditorHandle,{
  kind:"plan"|"expense"|"advance"; expenseType:string; data:FinanceTripData; foundation:Foundation; today:string; entry?:Entry;
  onSaved:()=>void; onCancel:()=>void; onLeave?:()=>void; onPending?:(pending:boolean)=>void;
}>(function TripEntryEditor({kind,expenseType,data,foundation,today,entry,onSaved,onCancel,onLeave,onPending},ref) {
  const t=useTranslations("Finance.trips"),f=useTranslations("Finance"),locale=useLocale();
  const root=useRef<HTMLDivElement>(null);
  const form=useRef<HTMLFormElement>(null),initial=useRef<string|null>(null);
  const submission=useRef<{promise:Promise<boolean>;resolve:(saved:boolean)=>void}|null>(null);
  const [pending,setPending]=useState(false);
  const [feedback,setFeedback]=useState<{state:"idle"|"saving"|"saved"|"error";message?:string;retry?:boolean}>({state:"idle"});
  const base=foundation.settings?.base_currency ?? "UAH";
  const plans=data.entries.filter(e=>e.kind==="plan" && e.expense_type===expenseType && !e.reverses_id && !data.entries.some(r=>r.reverses_id===e.id || r.plan_id===e.id));
  const contextual=plans.length===1 ? plans[0] : undefined;
  const [payer,setPayer]=useState(entry?.employee_id ?? (kind==="advance" ? data.travelers.find(v=>v.active)?.employee_id ?? "" : "studio"));
  const [accountId,setAccountId]=useState(data.entryPayments.find(v=>v.movement_id===entry?.movement_id)?.account_id ?? foundation.accounts.find(v=>!v.archived_at)?.id ?? "");
  const [currency,setCurrency]=useState(entry?.currency ?? contextual?.currency ?? base);
  const [amount,setAmount]=useState(entry?.amount ?? "");
  const [date,setDate]=useState(entry?.financial_date ?? today);
  const [mode,setMode]=useState("record"),[movementId,setMovementId]=useState("");
  const [chosenPlan,setChosenPlan]=useState<string|null>(null);
  const [perDiem,setPerDiem]=useState(Boolean(entry?.daily_rate) || !entry && kind==="plan" && expenseType==="meals");
  const [rate,setRate]=useState(entry?.daily_rate ?? "");
  const [days,setDays]=useState(String(entry?.day_count ?? Math.min(366,tripDays(data.trip.starts_on ?? today,data.trip.ends_on ?? today))));
  const [covered,setCovered]=useState(()=>entry?.daily_rate && data.coverage.some(v=>v.entry_id===entry.id) ? data.coverage.filter(v=>v.entry_id===entry.id && data.travelers.some(person=>person.employee_id===v.employee_id && person.active)).map(v=>v.employee_id) : data.travelers.filter(v=>v.active).map(v=>v.employee_id));
  const [expectedDate,setExpectedDate]=useState(data.planDates.find(v=>v.id===entry?.expected_item_id)?.expected_payment_date ?? "");
  const [reference,setReference]=useState<{currency:string;rate:string|null}|null>(null);
  const cash=kind==="advance" || kind==="expense" && payer==="studio";
  const matched=cash && mode==="match";
  const movement=data.payments.find(v=>v.id===movementId);
  const code=cash ? matched ? movement?.currency ?? base : foundation.accounts.find(v=>v.id===accountId)?.currency ?? base : currency;
  const digits=foundation.currencies.find(v=>v.code===code)?.minor_units ?? 2;
  const compatible=plans.filter(v=>v.currency===code);
  const choices=compatible.length ? compatible : plans;
  const planId=entry?.plan_id ?? chosenPlan ?? (choices.length===1 ? choices[0].id ?? "" : "");
  let calculated="";
  try { if(perDiem) calculated=tripPerDiem(rate,Number(days),digits,covered.length); } catch { /* Incomplete drafts remain editable. */ }
  const value=matched ? movement?.original_amount ?? "" : perDiem ? calculated : amount;
  const autosave=kind!=="advance";
  const blocked=perDiem&&!calculated||matched&&!movementId||kind==="expense"&&!entry&&choices.length>1&&chosenPlan===null;
  async function commit(){
    const current=form.current;
    if(!autosave||!current)return true;
    if(submission.current)return submission.current.promise;
    if(snapshot(current)===initial.current)return true;
    const draft=new FormData(current),raw=Object.fromEntries(draft);
    const valid=current.checkValidity()&&!blocked&&tripEntrySchema.safeParse({...raw,coveredTravelerIds:draft.getAll("coveredTravelerIds")}).success;
    if(!valid){setFeedback({state:"error",message:t("errors.invalid")});current.reportValidity();return false;}
    setFeedback({state:"saving"});
    let resolve:(saved:boolean)=>void=()=>undefined;
    const promise=new Promise<boolean>(done=>{resolve=done;});
    submission.current={promise,resolve};
    current.requestSubmit();
    return promise;
  }
  function finish(result:FinanceActionState){
    const active=submission.current;
    if(result.status==="success")setFeedback({state:"saved"});
    else setFeedback({state:"error",message:result.message??t("errors.save"),retry:true});
    submission.current=null;
    active?.resolve(result.status==="success");
  }
  useImperativeHandle(ref,()=>({commit}));
  useEffect(()=>{initial.current=form.current?snapshot(form.current):null;const frame=requestAnimationFrame(()=>root.current?.querySelector<HTMLInputElement>("[data-entry-focus]")?.focus());return ()=>cancelAnimationFrame(frame);},[]);
  useEffect(()=>{
    if(!autosave)return;
    const leave=(event:MouseEvent)=>{const node=root.current;if(!node||isEditorInteraction(node,event)||(event.target instanceof Element&&event.target.closest("[data-trip-editor-trigger]")))return;void commit().then(saved=>{if(saved)onLeave?.();});};
    document.addEventListener("click",leave);
    return()=>document.removeEventListener("click",leave);
  });
  useEffect(()=>{
    if(kind!=="plan" || code===base || data.estimates.fx.some(v=>v.currency===code)) return;
    let cancelled=false;
    void getProjectReferenceRate(code).then(v=>{if(!cancelled)setReference({currency:code,rate:v?.rate ?? null});}).catch(()=>{if(!cancelled)setReference({currency:code,rate:null});});
    return ()=>{cancelled=true;};
  },[kind,code,base,data.estimates.fx]);
  const fx=data.estimates.fx.find(v=>v.currency===code)?.rate ?? (reference?.currency===code ? reference.rate : null);
  let estimate:string|null=null;
  try { if(fx) estimate=projectReferenceValue(value,fx,digits,data.estimates.digits); } catch { /* Incomplete drafts have no estimate. */ }
  const inheritedFx=entry && entry.currency===code && entry.financial_date===date;
  return <div ref={root} onInput={()=>{if(feedback.state==="error")setFeedback({state:"idle"});}} onChange={()=>{if(feedback.state==="error")setFeedback({state:"idle"});}} onKeyDown={e=>{if(e.key==="Escape"&&!e.defaultPrevented&&!pending){e.preventDefault();e.stopPropagation();onCancel();}else if(autosave&&e.key==="Enter"&&!e.defaultPrevented&&e.target instanceof HTMLInputElement){e.preventDefault();void commit().then(saved=>{if(saved)onLeave?.();});}}} className="bg-[var(--ui-surface-subtle)] px-4 py-3 sm:px-5">
    <FinanceActionForm formRef={form} action={saveFinanceTrip} onSaved={onSaved} onResult={autosave?finish:undefined} onPending={v=>{setPending(v);if(autosave&&v)setFeedback({state:"saving"});onPending?.(v);}} onCancel={onCancel} cancelLabel={f("close")} label={entry ? t("update") : f("planning.save")} disabled={blocked} hideActions={autosave} showMessage={!autosave} fieldsetClassName="grid min-w-0 grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto]" actionsClassName="flex justify-end gap-2 lg:col-start-2 lg:row-start-2">
      <input type="hidden" name="intent" value="entry"/><input type="hidden" name="tripId" value={data.trip.id ?? ""}/><input type="hidden" name="entryId" value={entry?.id ?? ""}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="expenseType" value={expenseType}/>
      <input type="hidden" name="employeeId" value={kind==="plan" || payer==="studio" ? "" : payer}/><input type="hidden" name="planId" value={kind==="expense" ? planId : ""}/>
      <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-2"><p className="text-sm font-medium">{t(`types.${expenseType}`)} <span className="font-normal text-[var(--ui-text-muted)]">· {t(kind==="plan" ? "plan" : kind==="advance" ? "issueAdvance" : "actual")}</span></p><div className="flex items-center gap-2">{autosave?<span role="status" aria-live="polite" className="min-w-16 text-right text-xs text-[var(--ui-text-muted)]">{feedback.state==="saving"?t("saving"):feedback.state==="saved"?t("saved"):""}</span>:null}{expenseType==="meals" && !matched ? <Button type="button" size="sm" variant={perDiem ? "outline":"ghost"} aria-pressed={perDiem} onClick={()=>setPerDiem(!perDiem)}>{t("perDiem")}</Button>:null}</div></div>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {perDiem ? <FormField label={t("dailyRate")}><Input data-entry-focus name="dailyRate" inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} required/></FormField> : <FormField label={f("movements.amount")}><Input data-entry-focus name="amount" inputMode="decimal" value={value} onChange={e=>setAmount(e.target.value)} readOnly={matched} required/></FormField>}
        {cash ? <input type="hidden" name="currency" value={code}/> : <FormField label={t("currency")}><FinanceCurrencySelect name="currency" aria-label={t("currency")} currencies={foundation.currencies} reportingCurrency={base} value={currency} onValueChange={setCurrency}/></FormField>}
        {kind!=="plan" ? <FormField label={kind==="advance" ? t("traveler"):t("paidBy")}><Select aria-label={kind==="advance" ? t("traveler"):t("paidBy")} value={payer} onValueChange={setPayer}>{kind!=="advance" ? <SelectItem value="studio">{t("studioAccount")}</SelectItem>:null}{data.travelers.filter(v=>v.active || v.employee_id===entry?.employee_id).map(v=><SelectItem key={v.employee_id} value={v.employee_id}>{v.employee_name}</SelectItem>)}</Select></FormField>:null}
        {kind!=="plan" && !matched ? <FormField label={f("movements.date")}><DatePicker name="date" aria-label={f("movements.date")} locale={locale} value={date} onValueChange={setDate} min={foundation.settings?.cutover_date} max={today} required/></FormField>:<input type="hidden" name="date" value={matched ? movement?.financial_date ?? today : entry?.financial_date ?? today}/>}
        {cash && !matched ? <FormField label={f("movements.account")}><Select name="accountId" aria-label={f("movements.account")} value={accountId} onValueChange={setAccountId} required>{foundation.accounts.filter(v=>!v.archived_at).map(v=><SelectItem key={v.id} value={v.id}>{v.name} · {v.currency}</SelectItem>)}</Select></FormField>:null}
        {matched ? <FormField label={t("existingPayment")}><Select name="movementId" aria-label={t("existingPayment")} value={movementId} onValueChange={setMovementId} required>{data.payments.filter(v=>v.unapplied_amount===v.original_amount || Number(v.unapplied_amount)===Number(v.original_amount) || v.planId===planId).map(v=><SelectItem key={v.id} value={v.id ?? ""}>{v.description} · {v.original_amount} {v.currency}</SelectItem>)}</Select></FormField>:null}
        {kind==="expense" && !entry && choices.length>1 ? <FormField label={t("whichPlan")}><Select aria-label={t("whichPlan")} value={chosenPlan===null ? "choose" : planId || "none"} onValueChange={v=>setChosenPlan(v==="none" ? "":v)}><SelectItem value="choose" disabled>{t("whichPlan")}</SelectItem><SelectItem value="none">{t("unplanned")}</SelectItem>{choices.map(v=><SelectItem key={v.id} value={v.id ?? ""}>{v.label || t(`types.${v.expense_type}`)} · {v.amount} {v.currency}</SelectItem>)}</Select></FormField>:null}
      </div>
      <div className="space-y-2 lg:col-span-2"><AnimatedFormContent isOpen={perDiem}><fieldset disabled={!perDiem} className="space-y-2"><input type="hidden" name="amount" value={calculated}/><input type="hidden" name="dayCount" value={days}/>{covered.map(id=><input key={id} type="hidden" name="coveredTravelerIds" value={id}/>)}
        <p className="text-sm font-medium tabular-nums" aria-live="polite">{calculated ? t("calculation",{rate,currency:code,days,count:covered.length,total:calculated}):t("chooseCoverage")}</p>
        <AnimatedDisclosure title={t("coverageOptions",{days,count:covered.length})}><div className="flex flex-wrap items-end gap-3 pb-2"><FormField label={t("days")} className="w-24"><Input inputMode="numeric" value={days} onChange={e=>setDays(e.target.value)} required={perDiem}/></FormField>{data.travelers.filter(v=>v.active).map(v=><Button type="button" key={v.employee_id} variant="outline" aria-pressed={covered.includes(v.employee_id)} onClick={()=>setCovered(ids=>ids.includes(v.employee_id) ? ids.filter(id=>id!==v.employee_id):[...ids,v.employee_id])}>{covered.includes(v.employee_id)?<Check className="mr-2 size-3.5" aria-hidden="true"/>:null}{v.employee_name}</Button>)}</div></AnimatedDisclosure>
      </fieldset></AnimatedFormContent>
      {kind==="plan" && code!==base ? <p className={quiet} aria-live="polite">{estimate ? `${value} ${code} ≈ ${estimate} ${base}`:t("estimateUnavailable")}</p>:null}
      {kind!=="plan" && !matched ? inheritedFx ? <><input type="hidden" name="fxMode" value="manual"/><input type="hidden" name="manualRate" value={entry.fx_rate ?? ""}/></> : <FinanceFxFields key={code} currency={code} base={base}/>:null}
      <AnimatedDisclosure title={t("moreOptions")} defaultOpen={Boolean(entry?.label || entry?.note || expectedDate)}><div className="grid gap-3 pb-2 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label={t("customLabel")}><Input name="label" defaultValue={entry?.label ?? ""} maxLength={160}/></FormField>
        {kind==="plan" ? <FormField label={t("expectedDate")}><DatePicker name="expectedDate" aria-label={t("expectedDate")} locale={locale} value={expectedDate} onValueChange={setExpectedDate}/><span className={quiet}>{t("forecastHelp")}</span></FormField>:null}
        {cash && !entry ? <FormField label={t("payment")}><Select aria-label={t("payment")} value={mode} onValueChange={v=>{setMode(v);if(v==="match")setPerDiem(false);}}><SelectItem value="record">{t("recordPayment")}</SelectItem><SelectItem value="match">{t("matchPayment")}</SelectItem></Select></FormField>:null}
        <FormField label={t("note")}><Textarea name="note" defaultValue={entry?.note ?? ""} rows={1} maxLength={2000}/></FormField>
      </div></AnimatedDisclosure>
      {entry && kind==="expense" ? <div className="space-y-2"><FormField label={t("reason")}><Input name="reason" required maxLength={2000}/></FormField>{entry.movement_id ? <label className="flex min-h-11 items-center gap-2 text-sm"><input className="size-4 accent-[var(--ui-action-primary)]" type="checkbox" name="confirmed" required/>{t("confirmPaymentUpdate")}</label>:null}</div>:null}
      {autosave&&feedback.state==="error"?<div className="flex items-center justify-between gap-3 lg:col-span-2"><p role="alert" className="text-sm text-[var(--ui-danger-text)]">{feedback.message}</p>{feedback.retry?<Button type="button" size="sm" variant="ghost" onClick={()=>void commit()}>{t("retry")}</Button>:null}</div>:null}
      </div>
    </FinanceActionForm>
  </div>;
});
