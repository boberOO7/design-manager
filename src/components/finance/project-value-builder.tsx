"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { saveFinanceProject, getProjectReferenceRate } from "@/app/(app)/finance/project-actions";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { AnimatedFormContent } from "@/components/ui/animated-form-content";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";
import { formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { projectAreaValue, projectMoneyText, projectMoneyUnits, projectPaymentAmounts, projectPaymentTemplates, projectReferenceValue, type ProjectPlanInput } from "@/lib/finance-project-plan";
import type { FinanceProjectData } from "@/data/queries/finance";

type Row = ProjectPlanInput["items"][number] & { key: string; percentage: string; differentDate: boolean };
export function ProjectValueBuilder({ project, currencies, reportingCurrency, onSaved, onPending }: {
  project: FinanceProjectData; currencies: FinanceCurrency[]; reportingCurrency: string; onSaved: () => void; onPending: (pending: boolean) => void;
}) {
  const t=useTranslations("Finance"),locale=useLocale();
  const current=project.terms.find(v=>v.stream==="design"),pricing=project.planRevisions.find(v=>v.terms_id===current?.id);
  const protectedItems=project.planItems.filter(v=>v.has_settlement_history);
  const [method,setMethod]=useState(pricing?.pricing_method??"fixed");
  const [currency,setCurrency]=useState(current?.currency??reportingCurrency),[value,setValue]=useState(String(current?.amount??""));
  const [area,setArea]=useState(String(pricing?.area_snapshot??project.area??"")),[rate,setRate]=useState(String(pricing?.rate_per_m2??""));
  const [strategy,setStrategy]=useState(current?"manual":"redistribute");
  const [allowUnscheduled,setAllowUnscheduled]=useState(Number(project.totals.find(v=>v.stream==="design")?.unscheduled_amount??0)>0);
  const [reserve,setReserve]=useState("0");
  function freshRow(index:number, count:number, percentage=""):Row {
    return {key:crypto.randomUUID(),id:"",name:t(protectedItems.length?"builder.paymentNumber":index===0?"builder.advance":index===count-1?"builder.finalPayment":"builder.paymentNumber",{number:protectedItems.length+index+1}),amount:"",percentage,dueDate:"",expectedDate:"",differentDate:false};
  }
  const [rows,setRows]=useState<Row[]>(()=>current?project.planItems.filter(v=>!v.has_settlement_history).sort((a,b)=>{
    const order=pricing?.item_order??[]; const ai=order.indexOf(a.id??""),bi=order.indexOf(b.id??"");
    return (ai<0?order.length:ai)-(bi<0?order.length:bi)||(a.due_date??"9999").localeCompare(b.due_date??"9999");
  }).map(v=>({key:v.id??crypto.randomUUID(),id:v.id??"",name:v.description??"",amount:v.amount,percentage:"",dueDate:v.due_date??"",expectedDate:v.expected_payment_date??"",differentDate:Boolean(v.expected_payment_date&&v.expected_payment_date!==v.due_date)})):[freshRow(0,2,"50"),freshRow(1,2,"50")]);
  const [reference,setReference]=useState<{currency:string;rate:string;effectiveDate:string}|null>(null);
  useEffect(()=>{
    if(reportingCurrency!=="UAH"||currency==="UAH") return;
    let active=true;
    void getProjectReferenceRate(currency).then(result=>{if(active)setReference(result?{...result,currency}:null);}).catch(()=>{if(active)setReference(null);});
    return ()=>{active=false;};
  },[currency,reportingCurrency]);
  const reporting=currencies.find(v=>v.code==="UAH");
  const selected=currencies.find(v=>v.code===currency),digits=selected?.minor_units??2;
  const money=(amount:string)=>selected?formatFinanceAmount(amount,selected,locale):amount;
  let total="",protectedValue="0",collected="0",scheduled="0",remainder="0",amounts:string[]=[],referenceAmount="",valid=false,error="";
  try {
    total=method==="area"?projectAreaValue(area,rate,digits):projectMoneyText(projectMoneyUnits(value,digits),digits);
    const protectedUnits=protectedItems.reduce((sum,v)=>sum+projectMoneyUnits(v.amount,digits),BigInt(0));
    protectedValue=projectMoneyText(protectedUnits,digits);
    collected=projectMoneyText(project.planItems.reduce((sum,v)=>sum+projectMoneyUnits(v.settled_amount,digits),BigInt(0)),digits);
    const pool=projectMoneyUnits(total,digits)-protectedUnits;
    if(pool<BigInt(0)) throw new Error("overScheduled");
    if(strategy==="redistribute"&&rows.length) {
      const reserved=allowUnscheduled?projectMoneyUnits(reserve,digits):BigInt(0);
      if(reserved>pool) throw new Error("overScheduled");
      amounts=projectPaymentAmounts(projectMoneyText(pool-reserved,digits),rows.map(v=>v.percentage),digits,false);
    } else amounts=rows.map(v=>projectMoneyText(projectMoneyUnits(v.amount,digits),digits));
    const scheduledUnits=amounts.reduce((sum,v)=>sum+projectMoneyUnits(v,digits),BigInt(0));
    scheduled=projectMoneyText(scheduledUnits,digits);remainder=projectMoneyText(pool-scheduledUnits,digits);
    if(scheduledUnits>pool) throw new Error("overScheduled");
    valid=projectMoneyUnits(total,digits)>BigInt(0)&&amounts.every(v=>projectMoneyUnits(v,digits)>BigInt(0))&&(pool===scheduledUnits||allowUnscheduled);
    if(strategy==="redistribute"&&rows.length&&rows.reduce((sum,v)=>sum+projectMoneyUnits(v.percentage,4),BigInt(0))!==BigInt(1000000)) {valid=false;error=t("builder.percentagesHelp");}
    if(!valid&&!error) error=t("builder.reconcileHelp");
    if(reference?.currency===currency&&currency!=="UAH") referenceAmount=projectReferenceValue(total,reference.rate,digits);
  } catch(cause) { error=t(cause instanceof Error&&cause.message==="overScheduled"?"project.errors.overScheduled":cause instanceof Error&&cause.message==="percentages"?"builder.percentagesHelp":"builder.invalidPreview"); }
  const payload={projectId:project.projectId,revision:current?.revision??0,pricingMethod:method,amount:total,currency,area,rate,allowUnscheduled,
    known:project.planItems.map(v=>({id:v.id,version:v.version,protected:v.has_settlement_history})),
    items:rows.map((v,index)=>({id:v.id,name:v.name,amount:amounts[index]??"",dueDate:v.dueDate,expectedDate:v.differentDate?v.expectedDate:v.dueDate}))};
  function update(index:number,patch:Partial<Row>) {setRows(current=>current.map((row,i)=>i===index?{...row,...patch}:row));}
  function template(percentages:readonly number[]) {
    setStrategy("redistribute");setReserve("0");
    setRows(old=>percentages.map((percentage,index)=>({... (old[index]?.id?old[index]:freshRow(index,percentages.length)),percentage:String(percentage)})));
  }
  function move(index:number,offset:number) {setRows(old=>{const copy=[...old];[copy[index],copy[index+offset]]=[copy[index+offset],copy[index]];return copy;});}
  const differentArea=pricing?.pricing_method==="area"&&project.area!==null&&Number(pricing.area_snapshot)!==Number(project.area);
  return <FinanceActionForm action={async(state,form)=>{form.set("plan",JSON.stringify({...payload,reason:form.get("reason")}));return saveFinanceProject(state,form);}} label={t("builder.saveRevision")} disabled={!valid} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value="plan"/>
    <fieldset className="space-y-4"><legend className="mb-3 text-sm font-semibold">1. {t("builder.pricing")}</legend>
      <FormField label={t("builder.pricingMethod")}><Select value={method} onValueChange={setMethod} aria-label={t("builder.pricingMethod")}><SelectItem value="fixed">{t("builder.fixed")}</SelectItem><SelectItem value="area">{t("builder.perArea")}</SelectItem></Select></FormField>
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("project.contract")}><Input aria-label={t("project.contract")} inputMode="decimal" value={method==="area"?total:value} onChange={e=>setValue(e.target.value)} readOnly={method==="area"} required/></FormField>
      {project.hasDesignHistory?<FormField label={t("project.currency")}><Input value={currency} readOnly/><p className="text-xs text-[var(--ui-text-muted)]">{t("builder.currencyLocked")}</p></FormField>:<FormField label={t("project.currency")}><FinanceCurrencySelect name="currency" aria-label={t("project.currency")} currencies={currencies} reportingCurrency={reportingCurrency} value={currency} onValueChange={setCurrency}/></FormField>}</div>
      <div className="motion-reduce:[&_*]:transition-none"><AnimatedFormContent isOpen={method==="area"}><fieldset disabled={method!=="area"} className="grid gap-4 pt-3 sm:grid-cols-2"><FormField label={t("builder.area")}><Input inputMode="decimal" value={area} onChange={e=>setArea(e.target.value)} required={method==="area"}/></FormField><FormField label={t("builder.rate")}><Input inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} required={method==="area"}/></FormField><p className="text-sm text-[var(--ui-text-secondary)] sm:col-span-2">{area||"—"} m² × {rate||"—"} {currency}/m² = {total?money(total):"—"}</p></fieldset></AnimatedFormContent></div>
      {differentArea?<div className="text-sm text-[var(--ui-warning-text)]"><p>{t("builder.areaChanged",{saved:pricing?.area_snapshot??0,current:project.area??0})}</p><Button variant="ghost" className="min-h-11" onClick={()=>setArea(String(project.area))}>{t("builder.useCurrentArea")}</Button></div>:null}
      {reportingCurrency==="UAH"&&currency!=="UAH"?<p className="text-xs text-[var(--ui-text-secondary)]">{referenceAmount&&reference&&reporting?t("builder.reference",{amount:formatFinanceAmount(referenceAmount,reporting,locale),date:reference.effectiveDate}):t("builder.referenceUnavailable")}</p>:null}
    </fieldset>
    <fieldset className="space-y-3 border-t border-[var(--ui-border)] pt-4"><legend className="pt-4 text-sm font-semibold">2. {t("builder.schedule")}</legend>
      {protectedItems.length?<div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3 text-sm"><p className="font-medium">{t("builder.protectedHelp")}</p><ul className="mt-2 space-y-2">{protectedItems.map(item=><li key={item.id} className="flex flex-wrap justify-between gap-2"><span>{item.description}</span><span className="ui-numeric">{money(item.amount)}</span></li>)}</ul></div>:null}
      <FormField label={t("builder.strategy")}><Select aria-label={t("builder.strategy")} value={strategy} onValueChange={next=>{if(strategy==="redistribute"&&next==="manual")setRows(old=>old.map((v,i)=>({...v,amount:amounts[i]??v.amount})));setStrategy(next);if(next==="keep")setRows(old=>old.map(v=>({...v,amount:project.planItems.find(p=>p.id===v.id)?.amount??v.amount})));}}><SelectItem value="redistribute">{t("builder.redistribute")}</SelectItem><SelectItem value="keep">{t("builder.keep")}</SelectItem><SelectItem value="manual">{t("builder.manual")}</SelectItem></Select></FormField>
      <div className="flex flex-wrap gap-2" aria-label={t("builder.templates")}>{projectPaymentTemplates.map(percentages=><Button key={percentages.join("/")} variant="outline" className="min-h-11" onClick={()=>template(percentages)}>{percentages.join(" / ")}{percentages.length===1?"%":""}</Button>)}<Button variant="outline" className="min-h-11" onClick={()=>{if(strategy==="redistribute")setRows(old=>old.map((v,i)=>({...v,amount:amounts[i]??v.amount})));setStrategy("manual");}}>{t("builder.custom")}</Button><Button variant="ghost" className="min-h-11" onClick={()=>{setRows([]);setStrategy("manual");setAllowUnscheduled(true);}}>{t("builder.scheduleLater")}</Button></div>
      {strategy==="redistribute"?<p className="text-xs text-[var(--ui-text-secondary)]">{t("builder.percentagesHelp")}{protectedItems.length?` ${t("builder.remainingBasis")}`:""}</p>:null}
      <ol className="space-y-3">{rows.map((row,index)=><li key={row.key} className="space-y-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3" data-plan-row>
        <div className="flex items-end gap-2"><div className="min-w-0 flex-1"><FormField label={t("builder.paymentName")}><Input value={row.name} onChange={e=>update(index,{name:e.target.value})} required maxLength={2000}/></FormField></div><Button variant="ghost" className="size-11 shrink-0 p-0" disabled={index===0} aria-label={t("builder.moveUp")} onClick={()=>move(index,-1)}><ArrowUp className="size-4"/></Button><Button variant="ghost" className="size-11 shrink-0 p-0" disabled={index===rows.length-1} aria-label={t("builder.moveDown")} onClick={()=>move(index,1)}><ArrowDown className="size-4"/></Button><Button variant="ghost" className="size-11 shrink-0 p-0" aria-label={t("builder.remove")} onClick={()=>setRows(old=>old.filter((_,i)=>i!==index))}><Trash2 className="size-4"/></Button></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{strategy==="redistribute"?<FormField label={t("builder.percentage")}><Input inputMode="decimal" value={row.percentage} onChange={e=>update(index,{percentage:e.target.value})} required/></FormField>:null}<FormField label={t("movements.amount")}><Input inputMode="decimal" value={strategy==="redistribute"?amounts[index]??"":row.amount} readOnly={strategy==="redistribute"||strategy==="keep"&&Boolean(row.id)} onChange={e=>update(index,{amount:e.target.value})} required/></FormField><FormField label={t("planning.dueDate")}><Input type="date" value={row.dueDate} onChange={e=>update(index,{dueDate:e.target.value})}/></FormField></div>
        <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={row.differentDate} onChange={e=>update(index,{differentDate:e.target.checked})}/>{t("planning.differentExpectedDate")}</label>
        {row.differentDate?<FormField label={t("planning.expectedDate")}><Input type="date" value={row.expectedDate} onChange={e=>update(index,{expectedDate:e.target.value})}/></FormField>:null}
      </li>)}</ol>
      <Button variant="outline" className="min-h-11 gap-2" onClick={()=>setRows(old=>[...old,freshRow(old.length,old.length+1)])}><Plus className="size-4"/>{t("project.addPayment")}</Button>
    </fieldset>
    <fieldset className="space-y-3 border-t border-[var(--ui-border)] pt-4"><legend className="pt-4 text-sm font-semibold">3. {t("builder.review")}</legend>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={allowUnscheduled} onChange={e=>setAllowUnscheduled(e.target.checked)}/>{t("builder.allowUnscheduled")}</label>
      {allowUnscheduled&&strategy==="redistribute"?<FormField label={t("project.unscheduled")}><Input value={reserve} inputMode="decimal" onChange={e=>setReserve(e.target.value)}/></FormField>:null}
      <dl className="space-y-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3 text-sm" aria-live="polite">{([["project.contract",total],["project.collected",collected],["builder.protectedValue",protectedValue],["builder.newSchedule",scheduled],["project.unscheduled",remainder]] as const).map(([key,amount])=><div key={key} className="flex flex-wrap justify-between gap-2"><dt>{t(key)}</dt><dd className="ui-numeric font-semibold">{amount?money(amount):"—"}</dd></div>)}</dl>
      {error?<p role="status" className="text-sm text-[var(--ui-warning-text)]">{error}</p>:null}
      <FormField label={t("project.reason")}><Textarea name="reason" required maxLength={2000} rows={2}/></FormField>
    </fieldset>
  </FinanceActionForm>;
}
