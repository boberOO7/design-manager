"use client";
import { ArrowDownLeft, ArrowUpRight, Banknote, BriefcaseBusiness, ChevronDown, CircleAlert, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { useRouter } from "next/navigation";
import { useEffect,useState } from "react";
import { useLocale,useTranslations } from "next-intl";
import { saveFinanceProject } from "@/app/(app)/finance/project-actions";
import { instantToDateOnly } from "@/lib/calendar";
import { supervisionVisitTerms } from "@/lib/finance-projects";
import { saveFinanceSchedule } from "@/app/(app)/finance/schedules/actions";
import { saveFinancePlanning } from "@/app/(app)/finance/expected/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField,Input,Textarea } from "@/components/ui/form-field";
import { Select,SelectItem } from "@/components/ui/select";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCategorySelect } from "./category-select";
import { FinanceCurrencySelect } from "./currency-select";
import type { FinanceExpected } from "@/lib/finance-planning";
import { financeCategoryLabel,financeMovementCategoryLabel,projectPaymentPresentation } from "@/lib/finance-planning";
import { formatFinanceAmount } from "@/lib/finance";
import { formatDateOnly } from "@/lib/utils";
import type { FinancePlanningPeriod,getFinanceData,FinancePlanningData,FinanceProjectData } from "@/data/queries/finance";
import type { projectStreams } from "@/lib/finance-projects";

type Foundation=NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
const panel="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";
type ProjectContext=FinanceProjectData&{ stream:typeof projectStreams[number];today:string };

function ExpectedForm({ data,item,project,obligation,onSaved,onPending }: { data:Foundation; item?:FinanceExpected; project?:ProjectContext; obligation?:string; onSaved:()=>void; onPending:(value:boolean)=>void }) {
  const t=useTranslations("Finance"),locale=useLocale();
  const [direction,setDirection]=useState(item?.direction??"incoming");
  const terms=project?.terms.find((term)=>term.stream===project.stream);
  const defaultCategory=project?data.categories.find((category)=>!category.archived_at&&category.default_key===({ design:"project_payments",supervision:"supervision",contractor_bonus:"contractor_bonus",other:"other_income" }[project.stream])):null;
  const [currency,setCurrency]=useState(item?.currency??terms?.currency??data.settings?.base_currency??"UAH");
  const [amount,setAmount]=useState(String(item?.amount??(project?.stream==="supervision"&&terms?.mode==="per_visit"?terms.amount??"":"")));
  const [priceOverride,setPriceOverride]=useState(false);
  const [amountEntered,setAmountEntered]=useState(false),[currencyEntered,setCurrencyEntered]=useState(false);
  const [category,setCategory]=useState(item?.category_id??defaultCategory?.id??"");
  const [commitment,setCommitment]=useState(item?.commitment??(project?.stream==="contractor_bonus"?"tentative":"agreed"));
  const [source,setSource]=useState("manual"),[visit,setVisit]=useState(""),[contractor,setContractor]=useState(""),[extraVisit,setExtraVisit]=useState(false);
  const [estimated,setEstimated]=useState(item?.certainty==="estimated");
  const [established,setEstablished]=useState(item?.is_established??false);
  const [establishedTouched,setEstablishedTouched]=useState(Boolean(item));
  const [due,setDue]=useState(item?.due_date??""),[expected,setExpected]=useState(item?.expected_payment_date??"");
  const [separateExpected,setSeparateExpected]=useState(Boolean(item?.expected_payment_date&&item.expected_payment_date!==item.due_date));
  const fixedPayroll=Boolean(obligation && ["payout","deductions","bonus"].includes(obligation));
  const selectedVisit=source==="visit"&&!item?project?.visits.find((v)=>v.id===visit):undefined;
  const visitTerms=selectedVisit&&project?supervisionVisitTerms(project.termHistory,selectedVisit.starts_at):null;
  const contractDefault=visitTerms?.mode==="per_visit"&&!priceOverride;
  // Monthly agreements have no contractual extra-visit price. Ignore unrelated form defaults.
  const monthlyExtra=visitTerms?.mode==="monthly";
  const effectiveAmount=contractDefault?String(visitTerms.amount??""):monthlyExtra&&!amountEntered?"":amount;
  const effectiveCurrency=contractDefault?visitTerms.currency:monthlyExtra&&!currencyEntered?"":currency;
  const canEstablish=commitment==="agreed"&&!estimated;
  const effectiveEstablished=canEstablish&&(establishedTouched?established:Boolean(due)&&(!project||due<=project.today));
  return <FinanceActionForm action={saveFinancePlanning} label={t("planning.save")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value="expected"/><input type="hidden" name="id" value={item?.id??""}/><input type="hidden" name="version" value={item?.version??0}/>
    {project?<><input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="stream" value={project.stream}/>
      {item?<p className="text-xs text-[var(--ui-text-muted)]">{t("project.editHelp")}</p>:<>
        {project.stream==="supervision"?<><FormField label={t("project.chargeSource")}><Select name="source" aria-label={t("project.chargeSource")} value={source} onValueChange={setSource}><SelectItem value="manual">{t("project.manualCharge")}</SelectItem><SelectItem value="visit">{t("project.visitCharge")}</SelectItem></Select></FormField>
          {source==="visit"?<><FormField label={t("project.visit")}><Select name="visitId" aria-label={t("project.visit")} value={visit} onValueChange={setVisit} required searchPlaceholder={t("project.searchVisits")}>{project.visits.map((v)=><SelectItem key={v.id} value={v.id}>{v.title} · {formatDateOnly(instantToDateOnly(v.starts_at),locale)}</SelectItem>)}</Select></FormField><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={extraVisit} required={monthlyExtra} onChange={(e)=>setExtraVisit(e.target.checked)}/>{t("project.extraVisit")}</label><input type="hidden" name="extraVisit" value={String(extraVisit)}/></>:null}</>:null}
        {project.stream==="contractor_bonus"?<FormField label={t("project.contractor")}><Select name="contractorId" aria-label={t("project.contractor")} value={contractor} onValueChange={setContractor} searchPlaceholder={t("project.searchContractors")}><SelectItem value="">{t("project.noContractor")}</SelectItem>{project.contractors.map((c)=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</Select></FormField>:null}
      </>}</>:null}
    {selectedVisit?<><input type="hidden" name="visitPricing" value={contractDefault?"contract":"manual"}/><input type="hidden" name="visitTermsId" value={visitTerms?.id??""}/>
      {visitTerms?.mode==="per_visit"?<div className="space-y-2 text-sm"><p>{t("project.contractVisitPrice",{amount:visitTerms.amount??0,currency:visitTerms.currency})}</p><label className="flex items-start gap-2"><input type="checkbox" checked={priceOverride} onChange={(e)=>{if(e.target.checked){setAmount(effectiveAmount);setCurrency(effectiveCurrency);setAmountEntered(true);setCurrencyEntered(true);}setPriceOverride(e.target.checked);}}/>{t("project.overrideVisitPrice")}</label></div>:null}
    </>:null}
    {obligation?<p className="text-xs text-[var(--ui-text-muted)]">{t("schedules.sourceHelp")}</p>:null}
    {project||obligation?<input type="hidden" name="direction" value={item?.direction??"incoming"}/>:<fieldset><legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("planning.direction")}</legend><div className="inline-flex rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["incoming","outgoing"] as const).map((value)=><label key={value} className="relative cursor-pointer"><input className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" type="radio" name="direction" value={value} checked={direction===value} onChange={()=>{setDirection(value);setCategory("");}}/><span className="flex min-h-11 items-center rounded-[calc(var(--ui-radius-control)-2px)] px-4 text-sm text-[var(--ui-text-secondary)] peer-checked:bg-[var(--ui-surface)] peer-checked:font-semibold peer-checked:text-[var(--ui-text)] peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ui-focus)]">{t(value==="incoming"?"planning.income":"planning.expenses")}</span></label>)}</div></fieldset>}
    <div className={`grid gap-4 ${obligation?"":"sm:grid-cols-2"}`}>
    <div className="space-y-1">
      <div className={`grid gap-3 ${obligation?"":"grid-cols-[minmax(0,1fr)_8rem]"}`}>
        <FormField label={t("movements.amount")}><Input name="amount" readOnly={fixedPayroll||contractDefault} value={effectiveAmount} onChange={(e)=>{setAmount(e.target.value);setAmountEntered(true);if(monthlyExtra)setPriceOverride(true);}} inputMode="decimal" required/></FormField>
        {contractDefault?<FormField label={t("planning.currency")}><Input name="currency" value={effectiveCurrency} readOnly/></FormField>:obligation?<input type="hidden" name="currency" value={currency}/>:<FormField label={t("planning.currency")}><FinanceCurrencySelect aria-label={t("planning.currency")} name="currency" currencies={data.currencies} reportingCurrency={data.settings?.base_currency??""} value={effectiveCurrency} onValueChange={(value)=>{setCurrency(value);setCurrencyEntered(true);if(monthlyExtra)setPriceOverride(true);}}/></FormField>}
      </div>
      {!fixedPayroll?<label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={estimated} onChange={(event)=>setEstimated(event.target.checked)} className="size-4"/>{t("planning.estimatedAmount")}</label>:null}
    </div>
    {obligation?<input type="hidden" name="categoryId" value={category}/>:<FinanceCategorySelect categories={data.categories} direction={direction} owner={data.categories.find((c)=>c.id===item?.category_id)?.nature==="owner_distribution"} value={category} onValueChange={setCategory} currentId={item?.category_id}/>}
    </div>
    <div className="space-y-1">
      <div className="grid gap-4 sm:grid-cols-2">
        {obligation?<input type="hidden" name="dueDate" value={due}/>:<FormField label={t("planning.dueDate")}><DatePicker name="dueDate" aria-label={t("planning.dueDate")} value={due} onValueChange={(value)=>{setDue(value);if(!separateExpected)setExpected(value);}} locale={locale}/></FormField>}
        {separateExpected?<FormField label={t("planning.expectedDate")}><DatePicker name="expectedDate" aria-label={t("planning.expectedDate")} value={expected} onValueChange={setExpected} locale={locale}/></FormField>:<input type="hidden" name="expectedDate" value={expected}/>}
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={separateExpected} onChange={(event)=>{setSeparateExpected(event.target.checked);if(!event.target.checked)setExpected(due);}} className="size-4"/>{t("planning.differentExpectedDate")}</label>
    </div>
    <input type="hidden" name="certainty" value={estimated?"estimated":"fixed"}/><input type="hidden" name="established" value={String(effectiveEstablished)}/>
    {item?<FormField label={t("planning.agreementState")}><Select name="commitment" aria-label={t("planning.agreementState")} value={commitment} onValueChange={setCommitment}>{(project&&item.commitment!=="cancelled"?["agreed","tentative"]:["agreed","tentative","cancelled"]).map((value)=><SelectItem key={value} value={value}>{t(`planning.agreementOptions.${value}`)}</SelectItem>)}</Select></FormField>:<div>
      <input type="hidden" name="commitment" value={commitment}/>
      <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={commitment==="tentative"} onChange={(event)=>setCommitment(event.target.checked?"tentative":"agreed")} className="size-4"/>{t("planning.plannedPayment")}</label>
      {commitment==="tentative"?<p className="pl-7 text-xs text-[var(--ui-text-muted)]">{t("planning.plannedPaymentHelp")}</p>:null}
    </div>}
    <details open={Boolean(item?.description)} className="group/description rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] text-sm text-[var(--ui-text-secondary)]"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("movements.description")}<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open/description:rotate-180"/></summary><div className="border-t border-[var(--ui-border)] p-3"><Textarea aria-label={t("movements.description")} name="description" defaultValue={item?.description??""} rows={2} maxLength={2000}/></div></details>
    {canEstablish?<details className="group/treatment rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] text-sm text-[var(--ui-text-secondary)]"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("planning.financialTreatment")}<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open/treatment:rotate-180"/></summary><div className="space-y-1.5 border-t border-[var(--ui-border)] p-3"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={effectiveEstablished} onChange={(event)=>{setEstablishedTouched(true);setEstablished(event.target.checked);}} className="size-4"/>{t(direction==="incoming"?"planning.trackReceivable":"planning.trackObligation")}</label><p className="text-xs text-[var(--ui-text-muted)]">{t("planning.establishedAdvancedHelp")}</p></div></details>:null}
  </FinanceActionForm>;
}

function PayrollCostForm({ cost,onSaved,onPending }: { cost:FinancePlanningData["payrollCosts"][number];onSaved:()=>void;onPending:(value:boolean)=>void }) {
  const t=useTranslations("Finance");
  const [status,setStatus]=useState(cost.status??"unknown");
  return <FinanceActionForm action={saveFinanceSchedule} label={t("planning.save")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value="payrollCost"/><input type="hidden" name="obligationId" value={cost.obligation_id??""}/>
    <input type="hidden" name="component" value={cost.component??""}/><input type="hidden" name="revision" value={cost.revision??0}/>
    <p className="text-sm">{t(`schedules.components.${cost.component}`)} · {cost.currency}</p>
    <p className="text-sm text-[var(--ui-text-secondary)]">{t("schedules.completeCostHelp")}</p>
    {cost.reason?<p className="text-sm text-[var(--ui-text-muted)]">{t("schedules.previousCostNote")}: {cost.reason}</p>:null}
    <FormField label={t("schedules.certainty")}><Select name="status" aria-label={t("schedules.certainty")} value={status} onValueChange={setStatus}>{["unknown","fixed","estimated"].map((value)=><SelectItem key={value} value={value}>{t(`schedules.${value}`)}</SelectItem>)}</Select></FormField>
    {status!=="unknown"?<FormField label={t("movements.amount")}><Input aria-label={t("movements.amount")} aria-describedby="payroll-cost-zero-help" name="amount" inputMode="decimal" defaultValue={cost.amount??""} required/><p id="payroll-cost-zero-help" className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("schedules.explicitZeroHelp")}</p></FormField>:<input type="hidden" name="amount" value=""/>}
    <FormField label={t("movements.reason")}><Textarea name="reason" maxLength={2000} required/></FormField>
  </FinanceActionForm>;
}

export function FinanceExpectedWorkspace(props:Foundation&FinancePlanningData&{ page:number;creditPage:number;filter:string;period?:FinancePlanningPeriod;today?:string;project?:ProjectContext;itemId?:string;attention?:"overdue";status?:"overdue"|"cancelled" }) {
  const t=useTranslations("Finance"),locale=useLocale();
  const router=useRouter();
  const [editing,setEditing]=useState<FinanceExpected|"new"|null>(null);
  const [costEditing,setCostEditing]=useState<FinancePlanningData["payrollCosts"][number]|null>(null);
  const [savedCost,setSavedCost]=useState<FinancePlanningData["payrollCosts"][number]|null>(null);
  const [cancelling,setCancelling]=useState<FinanceExpected|null>(null);
  const [matching,setMatching]=useState<FinanceExpected|null>(null);
  const [paymentId,setPaymentId]=useState("");
  const [releasing,setReleasing]=useState<string|null>(null);
  const [pending,setPending]=useState(false);
  useEffect(()=>{if(props.itemId) document.getElementById(`expected-${props.itemId}`)?.scrollIntoView({block:"center"});},[props.itemId]);
  const money=(amount:number|null,code:string|null)=>{const currency=props.currencies.find((item)=>item.code===code);return currency?formatFinanceAmount(amount??0,currency,locale):`${amount??0} ${code??""}`;};
  const categoryLabel=(id:string|null)=>financeCategoryLabel(props.categories.find((item)=>item.id===id),"",(key)=>t(`planning.defaults.${key}`));
  const paymentLabel=(payment:FinancePlanningData["payments"][number])=>payment.description||financeMovementCategoryLabel(payment.category_id,payment.category,props.categories,(key)=>t(`planning.defaults.${key}`));
  const date=(value:string|null)=>value?formatDateOnly(value,locale):"—";
  const period=props.period??"all",today=props.project?.today??props.today??new Date().toISOString().slice(0,10),currentMonth=today.slice(0,7);
  const href=(page=props.page,credits=props.creditPage,filter=props.filter,nextPeriod=period,nextAttention: "overdue"|null|undefined=props.attention,nextStatus: "overdue"|"cancelled"|null|undefined=props.status)=>{if(props.project)return `/projects/${props.project.projectId}?view=finance&stream=${props.project.stream}&page=${page}&credits=${credits}&filter=${filter}`;const params=new URLSearchParams({page:String(page),credits:String(credits),filter,period:nextPeriod});if(nextStatus)params.set("status",nextStatus);else if(nextAttention)params.set("attention",nextAttention);return `/finance/expected?${params}`;};
  const matchingNature=props.categories.find((category)=>category.id===matching?.category_id)?.nature;
  const candidates=props.payments.filter((payment)=>payment.currency===matching?.currency&&payment.direction===matching?.direction&&payment.nature===matchingNature);
  const monthLabel=(value:string)=>{
    const parts=new Intl.DateTimeFormat(locale,{month:"long",year:"numeric",timeZone:"UTC"}).formatToParts(new Date(`${value}-01T00:00:00Z`));
    const month=parts.find((part)=>part.type==="month")?.value??value,year=parts.find((part)=>part.type==="year")?.value??"";
    return `${month.charAt(0).toLocaleUpperCase(locale)}${month.slice(1)} ${year}`;
  };
  const shortDate=(value:string)=>new Intl.DateTimeFormat(locale,{day:"numeric",month:"short",...(value.slice(0,4)!==today.slice(0,4)?{year:"numeric"}:{}),timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));
  const obligationFor=(item:FinanceExpected)=>props.obligations.find((entry)=>entry.expected_item_id===item.id);
  const linkFor=(item:FinanceExpected)=>props.links.find((entry)=>entry.expected_item_id===item.id);
  const cashPeriodFor=(item:FinanceExpected)=>item.expected_payment_date?.slice(0,7)??item.due_date?.slice(0,7)??"";
  const contextPeriodFor=(item:FinanceExpected)=>obligationFor(item)?.obligation.period_start?.slice(0,7)??linkFor(item)?.period_start?.slice(0,7)??"";
  const needsAttention=(item:FinanceExpected)=>item.commitment!=="cancelled"&&(item.remaining_amount??0)>0&&(item.due_state==="overdue"||item.payment_state==="partial"||(!item.expected_payment_date&&!item.due_date));
  const attention=props.items.filter(needsAttention),months=new Map<string,FinanceExpected[]>(),undated:FinanceExpected[]=[];
  for(const item of props.items){
    const itemPeriod=cashPeriodFor(item);
    if(itemPeriod) months.set(itemPeriod,[...(months.get(itemPeriod)??[]),item]);
    else undated.push(item);
  }
  const monthKeys=[...months.keys()];
  const orderedMonths=[...(months.has(currentMonth)?[currentMonth]:[]),...monthKeys.filter((month)=>month>currentMonth).sort(),...monthKeys.filter((month)=>month<currentMonth).sort().reverse()];
  const titleFor=(item:FinanceExpected)=>{
    const obligation=obligationFor(item),link=linkFor(item);
    const localized=obligation?.obligation.kind==="payroll"?item.description?.replace(/^Base salary(?= ·|$)/,t("schedules.defaultSalaryName")):item.description;
    const component=obligation&&["deductions","employer_cost"].includes(obligation.component)?localized?.replace(/ · (?:deductions|employer cost)(?= ·|$)/,` · ${t(`schedules.components.${obligation.component}`)}`):localized;
    const category=props.categories.find((itemCategory)=>itemCategory.id===item.category_id);
    const defaultRecurringName=obligation?.obligation.kind==="recurring"&&category?.name&&item.description?.replace(/ · \d{4}-\d{2}$/, "")===category.name?categoryLabel(item.category_id):null;
    const base=defaultRecurringName??(link?.source==="monthly"&&item.description===`Supervision · ${link.period_start?.slice(0,7)}`?t("project.streams.supervision"):(obligation||link?.source==="monthly"?component?.replace(/ · \d{4}-\d{2}$/,""):component)||categoryLabel(item.category_id));
    return obligation?.obligation.kind==="payroll"&&obligation.obligation.employee_name&&!base.includes(obligation.obligation.employee_name)?`${base} · ${obligation.obligation.employee_name}`:base;
  };
  const renderItem=(item:FinanceExpected)=>{
    const obligation=obligationFor(item),link=linkFor(item),history=props.history.filter((entry)=>entry.expected_item_id===item.id);
    const tripLink=props.tripLinks.find(entry=>entry.expected_item_id===item.id);
    const active=item.commitment!=="cancelled"&&(item.remaining_amount??0)>0,contextPeriod=contextPeriodFor(item);
    const project=link?.project?.name ? projectPaymentPresentation(item.description,link.project.name,t(`movements.kinds.${item.direction}`),t("planning.projectPayment")) : null;
    const title=project?.title??titleFor(item),rowDate=item.expected_payment_date??item.due_date;
    const category=categoryLabel(item.category_id);
    const employerLink=obligation?.component==="payout"?props.obligations.find((entry)=>entry.obligation_id===obligation.obligation_id&&entry.component==="employer_cost"):undefined;
    const employerItem=props.items.find((entry)=>entry.id===employerLink?.expected_item_id);
    const context=contextPeriod?(obligation?.obligation.kind==="payroll"?t("planning.forPeriod",{period:monthLabel(contextPeriod)}):monthLabel(contextPeriod)):link?.context_label??null;
    const subtitle=project?.context??context??(category!==title?category:null);
    const state=item.commitment==="cancelled"?t("planning.agreementOptions.cancelled"):item.payment_state==="partial"?t("planning.states.partial"):active&&item.due_state==="overdue"?t("planning.states.overdue"):item.payment_state==="settled"?t("planning.states.settled"):item.commitment==="tentative"?t("planning.agreementOptions.tentative"):item.certainty==="estimated"?t("planning.estimatedAmount"):item.due_state==="due"?t("planning.states.due"):!rowDate?t("planning.states.unscheduled"):t("planning.states.unpaid");
    const stateClass=active&&item.due_state==="overdue"?"bg-[var(--ui-danger-surface)] font-semibold text-[var(--ui-danger-text)]":item.payment_state==="partial"?"bg-[var(--ui-warning-surface)] font-medium text-[var(--ui-warning-text)]":item.payment_state==="settled"||item.commitment==="cancelled"?"bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]":"bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]";
    const amountClass=`${item.direction==="incoming"?"text-[var(--ui-success-text)]":"text-[var(--ui-danger-text)]"} ${item.payment_state==="settled"?"opacity-70":""}`;
    const TypeIcon=obligation?.obligation.kind==="payroll"?Banknote:project?BriefcaseBusiness:obligation?.obligation.kind==="recurring"||link?.source==="monthly"?RefreshCw:item.direction==="incoming"?ArrowDownLeft:ArrowUpRight;
    const typeIconClass=obligation?.obligation.kind==="payroll"||project||obligation?.obligation.kind==="recurring"||link?.source==="monthly"?"bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]":item.direction==="incoming"?"bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]":"bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]";
    return <article key={item.id} id={`expected-${item.id}`} data-direction={item.direction}>
      <details data-finance-motion className="group overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] transition-[border-color,box-shadow] duration-200 open:border-[var(--ui-border)] open:shadow-[var(--ui-shadow-panel)]" open={props.itemId===item.id}><summary aria-label={t("planning.detailsNamed",{name:project?`${title} · ${project.context}`:title})} className="grid min-h-20 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 gap-y-1 px-3 py-3 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] active:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none md:min-h-16 md:grid-cols-[8.5rem_minmax(0,1fr)_minmax(7.5rem,auto)_minmax(10rem,auto)_1rem] md:gap-x-5 md:px-4">
        <span className={`col-start-1 row-start-2 pl-11 text-xs md:col-start-1 md:row-start-1 md:pl-0 ${active&&item.due_state==="overdue"?"font-medium text-[var(--ui-danger-text)]":"text-[var(--ui-text-muted)]"}`}>{rowDate?(item.expected_payment_date?t("planning.timingExpected",{date:shortDate(rowDate)}):t("planning.timingDue",{date:shortDate(rowDate)})):t("planning.timingMissing")}</span>
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 md:col-start-2"><span className={`flex size-9 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] ${typeIconClass}`}><TypeIcon aria-hidden="true" className="size-[1.125rem]"/></span><div className="min-w-0"><h3 className={`break-words text-sm font-semibold leading-snug ${item.payment_state==="settled"?"text-[var(--ui-text-secondary)]":"text-[var(--ui-text)]"}`}>{title}</h3>{subtitle?<p className="mt-0.5 break-words text-xs text-[var(--ui-text-muted)]">{subtitle}</p>:null}</div></div>
        <span className={`col-start-1 row-start-3 ml-11 w-fit rounded-md px-2 py-0.5 text-[11px] leading-5 md:col-start-3 md:row-start-1 md:ml-0 ${stateClass}`}>{state}</span>
        <strong className={`ui-numeric col-start-2 row-span-3 row-start-1 whitespace-nowrap text-right text-base font-bold md:col-start-4 md:row-span-1 md:text-lg ${amountClass}`}>{item.certainty==="estimated"?"≈ ":""}{props.project ? "" : item.direction==="incoming"?"+":"−"}{money(item.amount,item.currency)}{props.project&&item.payment_state==="partial"?<span className="mt-1 block max-w-48 whitespace-normal text-xs font-normal text-[var(--ui-text-secondary)]">{t("planning.settlementProgress",{paid:money(item.settled_amount,item.currency),remaining:money(item.remaining_amount,item.currency)})}</span>:null}</strong>
        <ChevronDown className="col-start-3 row-span-3 row-start-1 size-4 text-[var(--ui-text-muted)] transition-transform duration-[220ms] group-open:rotate-180 motion-reduce:transition-none md:col-start-5 md:row-span-1" aria-hidden="true"/>
      </summary><div className="grid gap-4 border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface-muted)] px-3 pb-4 pt-3 text-sm md:px-4 xl:grid-cols-[minmax(0,1fr)_minmax(12rem,17rem)]">
        <div className="min-w-0">
        {obligation?.obligation.kind==="payroll"?<dl className="grid gap-x-6 gap-y-4 text-xs sm:grid-cols-2 2xl:grid-cols-4">
          <div className="min-w-0"><dt className="text-[var(--ui-text-muted)]">{t("schedules.components.payout")}</dt><dd className="break-words font-medium">{obligation.obligation.employee_name??title}</dd></div>
          <div><dt className="text-[var(--ui-text-muted)]">{t("schedules.period")}</dt><dd>{date(obligation.obligation.period_start)} – {date(obligation.obligation.period_end)}</dd></div>
          <div><dt className="text-[var(--ui-text-muted)]">{t("planning.dueDate")}{item.expected_payment_date&&item.expected_payment_date!==item.due_date?` / ${t("planning.expectedDate")}`:""}</dt><dd>{date(item.due_date)}{item.expected_payment_date&&item.expected_payment_date!==item.due_date?` / ${date(item.expected_payment_date)}`:""}</dd></div>
          <div><dt className="text-[var(--ui-text-muted)]">{t(`schedules.components.${obligation.component}`)}</dt><dd className="ui-numeric font-medium">{money(item.amount,item.currency)} · {state}</dd>{item.payment_state==="partial"?<dd>{t("planning.settlementProgress",{paid:money(item.settled_amount,item.currency),remaining:money(item.remaining_amount,item.currency)})}</dd>:null}</div>
          {employerItem?<div><dt className="text-[var(--ui-text-muted)]">{t("schedules.components.employer_cost")}</dt><dd className="ui-numeric font-medium">{money(employerItem.amount,employerItem.currency)} · {t(`planning.states.${employerItem.payment_state}`)}</dd></div>:null}
          {obligation.component==="payout"?props.payrollCosts.filter((cost)=>cost.obligation_id===obligation.obligation_id&&(!employerItem||cost.component!=="employer_cost")).map((cost)=><div key={cost.component}><dt className="text-[var(--ui-text-muted)]">{t(`schedules.components.${cost.component}`)}</dt><dd className="ui-numeric font-medium">{cost.status==="unknown"?t("schedules.unknown"):`${money(cost.amount,cost.currency)} · ${t(`schedules.${cost.status}`)}`}</dd>{cost.can_complete?<dd><Button size="sm" variant="ghost" disabled={savedCost?.obligation_id===cost.obligation_id&&savedCost?.component===cost.component&&savedCost?.revision===cost.revision} onClick={()=>setCostEditing(cost)}>{t("schedules.completeCost")}</Button></dd>:null}</div>):null}
        </dl>:<dl className="grid gap-x-6 gap-y-4 text-xs sm:grid-cols-2 2xl:grid-cols-4">
          <div className="min-w-0"><dt className="text-[var(--ui-text-muted)]">{t("movements.type")}</dt><dd className="break-words">{t(`movements.kinds.${item.direction}`)} · {categoryLabel(item.category_id)}{project?` · ${project.context}`:context?` · ${context}`:""}{link?.context_label?` · ${link.context_label}`:""}</dd></div>
          <div><dt className="text-[var(--ui-text-muted)]">{t("planning.dueDate")}</dt><dd>{date(item.due_date)}</dd></div>
          {item.expected_payment_date&&item.expected_payment_date!==item.due_date?<div><dt className="text-[var(--ui-text-muted)]">{t("planning.expectedDate")}</dt><dd>{date(item.expected_payment_date)}</dd></div>:null}
          {obligation?.obligation.kind==="recurring"?<div><dt className="text-[var(--ui-text-muted)]">{t("movements.amount")}</dt><dd>{item.certainty==="estimated"?"≈ ":""}{money(item.amount,item.currency)}</dd></div>:null}
          <div><dt className="text-[var(--ui-text-muted)]">{t("planning.agreementState")}</dt><dd>{t(`planning.agreementOptions.${item.commitment}`)} · {state}</dd></div>
          {item.payment_state==="partial"?<div><dt className="text-[var(--ui-text-muted)]">{t("planning.states.partial")}</dt><dd className="ui-numeric">{t("planning.settlementProgress",{paid:money(item.settled_amount,item.currency),remaining:money(item.remaining_amount,item.currency)})}</dd></div>:null}
        </dl>}
        </div>
        <div className="flex flex-wrap items-center gap-1 self-start rounded-[var(--ui-radius-control)] bg-[var(--ui-surface)] p-2 xl:flex-col xl:items-stretch">{active?<Button asChild size="sm"><Link href={`/finance/movements?expected=${item.id}`}>{t("planning.recordPayment")}</Link></Button>:null}{tripLink?<Link className="px-2 py-1.5 text-xs underline" href={`/finance/trips/${tripLink.trip_id}`}>{t("trips.title")}</Link>:link&&!props.project?<Link className="px-2 py-1.5 text-xs underline" href={`/projects/${link.project_id}?view=finance&stream=${link.stream}`}>{link.project?.name??t("project.open")}</Link>:<Button size="sm" variant="ghost" onClick={()=>setEditing(item)}>{t("edit")}</Button>}{active?<Button size="sm" variant="ghost" onClick={()=>{setPaymentId("");setMatching(item);}}>{t("planning.match")}</Button>:null}{link&&item.commitment!=="cancelled"?<Button size="sm" variant="ghost" onClick={()=>setCancelling(item)}>{t("project.cancelExpectation")}</Button>:null}</div>
        {history.length?<div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3 xl:col-span-2"><p className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("planning.history")}</p><ul className="mt-1 space-y-1 text-xs">{history.map((entry)=>{const remaining=entry.amount+history.filter((release)=>release.released_allocation_id===entry.id).reduce((sum,release)=>sum+release.amount,0);return <li key={entry.id} className="flex flex-wrap items-center gap-x-2 break-words"><span>{date(entry.movement.financial_date)} · {money(entry.amount,item.currency)} · {entry.amount<0?t(entry.cause_movement_id?"planning.cashRelease":"planning.manualRelease"):t("planning.matched")}</span>{entry.amount>0&&remaining>0&&!tripLink?.cash?<Button size="sm" variant="ghost" onClick={()=>setReleasing(entry.id)}>{t("planning.unmatch")}</Button>:null}</li>;})}</ul></div>:null}
      </div></details>
    </article>;
  };
  const renderMonth=(month:string,items:FinanceExpected[],label=monthLabel(month))=>{
    const completed=items.filter((item)=>item.payment_state==="settled"),openItems=items.filter((item)=>item.payment_state!=="settled");
    const totals=[...items.reduce((result,item)=>{const direction=item.direction==="incoming"?"incoming":"outgoing",key=`${direction}:${item.currency}`,current=result.get(key);return result.set(key,{direction,currency:item.currency,total:(current?.total??0)+(item.amount??0)});},new Map<string,{direction:string;currency:string|null;total:number}>()).values()].sort((left,right)=>left.direction.localeCompare(right.direction)||String(left.currency).localeCompare(String(right.currency)));
    const current=month===currentMonth,containsSelected=items.some((item)=>item.id===props.itemId);
    return <details key={month||"undated"} data-finance-motion className={`group/month rounded-[var(--ui-radius-panel)] border p-1.5 transition-colors duration-200 sm:p-2 ${current?"border-[var(--ui-border)] bg-[var(--ui-surface-subtle)]":"border-[var(--ui-border-subtle)] bg-[var(--ui-surface-muted)]"}`} data-payment-month={month||"undated"} data-current-month={current||undefined} data-future-month={month>currentMonth?month:undefined} open={current||containsSelected||!month}>
      <summary aria-label={t("planning.futureGroup",{month:label,count:items.length})} className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-[var(--ui-radius-control)] px-3 py-3 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] active:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] marker:content-none"><span className="flex items-center gap-2"><ChevronDown aria-hidden="true" className="size-4 shrink-0 -rotate-90 text-[var(--ui-text-muted)] transition-transform group-open/month:rotate-0 motion-reduce:transition-none"/><strong className="text-base font-semibold tracking-tight text-[var(--ui-text)]">{label}</strong><span className="ui-numeric flex min-w-6 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-1.5 py-0.5 text-xs font-semibold text-[var(--ui-text-secondary)]">{items.length}</span></span><span className="flex flex-wrap justify-end gap-x-3 gap-y-1">{totals.map((total)=><span key={`${total.direction}:${total.currency}`} className={`ui-numeric text-xs font-medium ${total.direction==="incoming"?"text-[var(--ui-success-text)]":"text-[var(--ui-danger-text)]"}`}>{total.direction==="incoming"?"+":"−"}{money(total.total,total.currency)}</span>)}</span></summary>
      <div className="space-y-1.5">{openItems.map(renderItem)}{completed.length?<details data-finance-motion className="group/completed rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)]" data-completed-month={month||"undated"} open={completed.some((item)=>item.id===props.itemId)}><summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-xs font-medium text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] active:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] marker:content-none"><ChevronDown aria-hidden="true" className="mr-2 size-4 shrink-0 -rotate-90 transition-transform duration-200 group-open/completed:rotate-0 motion-reduce:transition-none"/>{t("planning.sections.completed")} <span className="ml-1 text-[var(--ui-text-muted)]">· {completed.length}</span></summary><div className="space-y-1 p-1">{completed.map(renderItem)}</div></details>:null}</div>
    </details>;
  };
  const secondaryActive=Boolean(props.status);
  const secondaryFilters=["all","overdue","cancelled"] as const;
  const secondaryHref=(filter:typeof secondaryFilters[number])=>filter==="all"?href(1,props.creditPage,props.filter,period,null,null):filter==="overdue"?href(1,props.creditPage,props.filter,period,null,"overdue"):href(1,props.creditPage,props.filter,period,null,"cancelled");
  return <div className={`w-full min-w-0 ${props.project ? "space-y-3" : "space-y-6"}`}>
    {props.project?<div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t(`project.streams.${props.project.stream}`)}</h2>{props.settings?.finalized_at?<Button variant="outline" className="min-h-11 gap-2" onClick={()=>setEditing("new")}><Plus className="size-4" aria-hidden="true"/>{t("project.addPayment")}</Button>:null}</div>:<header className="flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><h1 className="text-3xl font-semibold tracking-tight text-[var(--ui-text)] sm:text-4xl">{t("planning.title")}</h1><p className="mt-1 max-w-3xl text-sm text-[var(--ui-text-muted)]">{t("planning.description")}</p></div>{props.settings?.finalized_at?<Button className="min-h-11 gap-2" onClick={()=>setEditing("new")}><Plus className="size-4" aria-hidden="true"/>{t("planning.create")}</Button>:null}</header>}
    {!props.settings?.finalized_at?<p className={`${panel} p-5 text-sm`}>{t("movements.setupRequired")} <Link href="/finance/accounts" className="underline">{t("movements.setupLink")}</Link></p>:null}
    {!props.project?<div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-1"><span className="pl-2 text-[11px] font-medium text-[var(--ui-text-muted)]">{t("planning.periodFilters.label")}</span><nav aria-label={t("planning.periodFilters.label")} className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["month","30days","3months","6months","all"] as const).map((value)=><Link key={value} href={href(1,props.creditPage,props.filter,value)} aria-current={period===value?"page":undefined} className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:bg-[var(--ui-surface)] hover:text-[var(--ui-text)] active:bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:text-[var(--ui-text)] aria-[current=page]:shadow-[var(--ui-shadow-panel)] sm:min-h-9">{t(`planning.periodFilters.${value}`)}</Link>)}</nav></div>
    <div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><span className="pl-2 text-[11px] font-medium text-[var(--ui-text-muted)]">{t("planning.direction")}</span><nav aria-label={t("planning.direction")} className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["all","incoming","outgoing"] as const).map((filter)=><Link key={filter} href={href(1,props.creditPage,filter)} aria-current={props.filter===filter?"page":undefined} className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:bg-[var(--ui-surface)] hover:text-[var(--ui-text)] active:bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:text-[var(--ui-text)] aria-[current=page]:shadow-[var(--ui-shadow-panel)] sm:min-h-9">{filter==="incoming"?t("planning.income"):filter==="outgoing"?t("planning.expenses"):t("planning.filtersList.all")}</Link>)}</nav></div><Popover.Root><Popover.Trigger asChild><button type="button" aria-haspopup="menu" className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:min-h-11">{t("planning.secondaryFilters")}{secondaryActive?` · ${t(`planning.filtersList.${props.status}`)}`:""}<ChevronDown aria-hidden="true" className="ml-2 size-4 shrink-0"/></button></Popover.Trigger><Popover.Portal><Popover.Content role="menu" align="end" sideOffset={4} collisionPadding={8} className="z-[80] min-w-44 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]">{secondaryFilters.map((filter)=><Popover.Close asChild key={filter}><Link role="menuitem" href={secondaryHref(filter)} aria-current={filter===props.status?"page":undefined} className="flex min-h-11 items-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm text-[var(--ui-text-secondary)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] active:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--ui-text)] sm:min-h-9">{t(`planning.filtersList.${filter}`)}</Link></Popover.Close>)}</Popover.Content></Popover.Portal></Popover.Root></div></div>:null}
    {props.items.length?<div className="space-y-5">{attention.length?<section className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-subtle)] px-4 py-3" aria-labelledby="expected-attention"><h2 id="expected-attention" className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]"><CircleAlert className="size-4 text-[var(--ui-danger-text)]" aria-hidden="true"/>{t("planning.attentionSummary",{count:attention.length})}</h2><dl className="flex flex-wrap gap-x-4 gap-y-2 text-xs"><div><dt className="inline text-[var(--ui-text-muted)]">{t("planning.attentionOverdue")}</dt><dd className="ui-numeric ml-1 inline font-semibold text-[var(--ui-danger-text)]">{attention.filter((item)=>item.due_state==="overdue").length}</dd></div><div><dt className="inline text-[var(--ui-text-muted)]">{t("planning.attentionMissingDate")}</dt><dd className="ui-numeric ml-1 inline font-semibold">{attention.filter((item)=>!item.expected_payment_date&&!item.due_date).length}</dd></div><div><dt className="inline text-[var(--ui-text-muted)]">{t("planning.attentionPartial")}</dt><dd className="ui-numeric ml-1 inline font-semibold">{attention.filter((item)=>item.payment_state==="partial").length}</dd></div></dl></section>:null}{props.project?<div className="space-y-1.5 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)] p-2">{props.items.map(renderItem)}</div>:<>{orderedMonths.map((month)=>renderMonth(month,months.get(month)??[]))}{undated.length?renderMonth("",undated,t("planning.unscheduledGroup")):null}</>}</div>:<p className={`${props.project ? "py-2" : `${panel} p-5`} text-sm text-[var(--ui-text-muted)]`}>{t("planning.empty")}</p>}
    <nav className="flex justify-between text-sm" aria-label={t("movements.pages")}>{props.page>1?<Link className="underline" href={href(props.page-1)}>{t("movements.previous")}</Link>:<span/>}{props.page*50<props.total?<Link className="underline" href={href(props.page+1)}>{t("movements.next")}</Link>:null}</nav>
    {props.creditTotal>0?<section className={`${panel} space-y-3 p-5`} aria-label={t("planning.unapplied")}><h2 className="font-medium">{t("planning.unapplied")}</h2><p className="text-xs text-[var(--ui-text-muted)]">{t("planning.unappliedHelp")}</p>{props.credits.length?<ul className="space-y-3">{props.credits.map((payment)=><li key={payment.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{date(payment.financial_date)} · {paymentLabel(payment)} · {t(`movements.kinds.${payment.direction}`)}</span><span className="ui-numeric">{money(payment.unapplied_amount,payment.currency)}</span></li>)}</ul>:<p className="text-sm text-[var(--ui-text-muted)]">{t("planning.noPayments")}</p>}<nav className="flex justify-between text-sm" aria-label={t("planning.creditPages")}>{props.creditPage>1?<Link className="underline" href={href(props.page,props.creditPage-1)}>{t("movements.previous")}</Link>:<span/>}{props.creditPage*50<props.creditTotal?<Link className="underline" href={href(props.page,props.creditPage+1)}>{t("movements.next")}</Link>:null}</nav></section>:null}
    <Dialog isOpen={cancelling!==null} closeDisabled={pending} onRequestClose={()=>setCancelling(null)} title={t("project.cancelExpectation")} closeLabel={t("movements.close")}>
      {cancelling?<div className="p-5"><FinanceActionForm action={saveFinanceProject} label={t("project.cancelExpectation")} onSaved={()=>setCancelling(null)} onPending={setPending}>
        <input type="hidden" name="intent" value="cancelExpectation"/><input type="hidden" name="itemId" value={cancelling.id??""}/><input type="hidden" name="version" value={cancelling.version??0}/><input type="hidden" name="settledAmount" value={cancelling.settled_amount??0}/>
        <p className="text-sm">{cancelling.description} · {money(cancelling.amount,cancelling.currency)}</p><p className="text-sm">{t("project.cancelExpectationHelp")}</p>
        {(cancelling.settled_amount??0)>0?<label className="flex items-start gap-2 text-sm"><input type="checkbox" name="retainSettlement" value="true" required/>{t("project.retainSettlement",{amount:money(cancelling.settled_amount,cancelling.currency)})}</label>:null}
        <FormField label={t("movements.reason")}><Textarea name="reason" maxLength={2000} required/></FormField>
      </FinanceActionForm></div>:null}
    </Dialog>
    <Dialog isOpen={costEditing!==null} closeDisabled={pending} onRequestClose={()=>setCostEditing(null)} title={t("schedules.completeCost")} closeLabel={t("movements.close")}>
      {costEditing?<div className="p-5"><PayrollCostForm cost={costEditing} onSaved={()=>{setSavedCost(costEditing);setCostEditing(null);}} onPending={setPending}/></div>:null}
    </Dialog>
    <Dialog isOpen={editing!==null} closeDisabled={pending} onRequestClose={()=>setEditing(null)} title={t(editing==="new"?"planning.create":"planning.edit")} closeLabel={t("movements.close")}>
      {editing?<div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6"><ExpectedForm obligation={editing!=="new"?props.obligations.find((entry)=>entry.expected_item_id===editing?.id)?.component:undefined} data={props} project={props.project} item={editing==="new"?undefined:editing} onSaved={()=>{const created=editing==="new";setEditing(null);if(created&&props.itemId)router.push("/finance/expected");}} onPending={setPending}/></div>:null}
    </Dialog>
    <Dialog isOpen={matching!==null} closeDisabled={pending} onRequestClose={()=>setMatching(null)} title={t("planning.match")} closeLabel={t("movements.close")}>
      {matching?<div className="p-5"><FinanceActionForm action={saveFinancePlanning} label={t("planning.match")} onSaved={()=>setMatching(null)} onPending={setPending}>
        <input type="hidden" name="intent" value="allocate"/><input type="hidden" name="itemId" value={matching.id??""}/>
        <p className="text-sm">{matching.description||categoryLabel(matching.category_id)} · {t("planning.remaining")}: {money(matching.remaining_amount,matching.currency)}</p>
        <FormField label={t("planning.payment")}><Select name="movementId" aria-label={t("planning.payment")} value={paymentId} onValueChange={setPaymentId} required searchPlaceholder={t("planning.searchPayments")} searchEmptyMessage={t("planning.noPayments")}>{candidates.map((payment)=><SelectItem key={payment.id} value={payment.id??""}>{date(payment.financial_date)} · {paymentLabel(payment)} · {money(payment.unapplied_amount,payment.currency)}</SelectItem>)}</Select></FormField>
        <FormField label={t("planning.allocateAmount")}><Input name="amount" inputMode="decimal" defaultValue={matching.remaining_amount??""} required/></FormField>
        <p className="text-xs text-[var(--ui-text-muted)]">{t("planning.matchHelp")}</p>
      </FinanceActionForm></div>:null}
    </Dialog>
    <Dialog isOpen={releasing!==null} closeDisabled={pending} onRequestClose={()=>setReleasing(null)} title={t("planning.unmatch")} closeLabel={t("movements.close")}>
      {releasing?<div className="p-5"><FinanceActionForm action={saveFinancePlanning} label={t("planning.unmatch")} onSaved={()=>setReleasing(null)} onPending={setPending}><input type="hidden" name="intent" value="release"/><input type="hidden" name="allocationId" value={releasing}/><p className="text-sm">{t("planning.unmatchHelp")}</p><FormField label={t("movements.reason")}><Textarea name="reason" maxLength={2000} required/></FormField></FinanceActionForm></div>:null}
    </Dialog>
  </div>;
}
