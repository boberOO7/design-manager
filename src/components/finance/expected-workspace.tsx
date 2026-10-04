"use client";
import { ArrowDownLeft, ArrowUpRight, Banknote, BriefcaseBusiness, ChevronDown, CircleAlert, CircleCheck, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { useRouter } from "next/navigation";
import { useEffect,useState,type ReactNode } from "react";
import { useLocale,useTranslations } from "next-intl";
import { saveFinanceProject } from "@/app/(app)/finance/project-actions";
import { instantToDateOnly } from "@/lib/calendar";
import { supervisionVisitTerms } from "@/lib/finance-projects";
import { saveFinanceSchedule } from "@/app/(app)/finance/schedules/actions";
import { getProjectCashMatchOptions, saveFinancePlanning } from "@/app/(app)/finance/expected/actions";
import { quoteFinanceSchedule, type quoteFinanceSettlement } from "@/app/(app)/finance/movements/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField,Input,Textarea } from "@/components/ui/form-field";
import { Select,SelectItem } from "@/components/ui/select";
import { FinanceActionForm } from "./finance-action-form";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { ProjectPaymentRow } from "./project-payment-row";
import { ProjectCashWorkspace } from "./project-cash-workspace";
import type { FinanceProjectCash } from "@/data/queries/finance-project-cash";
import { EntryForm } from "./movements-workspace";
import { ProjectSettlementForm, RemainderClosureForm } from "./project-settlement-form";
import { saveRemainderAdjustment } from "@/app/(app)/finance/project-payments/actions";
import { FinanceCategorySelect } from "./category-select";
import { FinanceCurrencySelect } from "./currency-select";
import type { FinanceExpected } from "@/lib/finance-planning";
import { financeCategoryLabel,financeMovementCategoryLabel,projectPaymentPresentation } from "@/lib/finance-planning";
import { formatFinanceAmount,formatFinanceDecimal } from "@/lib/finance";
import { indicativeFinanceConversion } from "@/lib/finance-fx-preview";
import { projectVatAmounts } from "@/lib/finance-project-plan";
import { formatDateOnly } from "@/lib/utils";
import type { FinancePlanningPeriod,getFinanceData,FinancePlanningData,FinanceProjectData } from "@/data/queries/finance";
import type { projectStreams } from "@/lib/finance-projects";

type Foundation=NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
const panel="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";
const projectActionClass="border border-transparent transition-colors duration-150 hover:border-[var(--ui-border)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] active:bg-[var(--ui-surface-muted)]";
const projectDestructiveActionClass="border border-transparent text-[var(--ui-danger-text)] transition-colors duration-150 hover:border-[var(--ui-border-subtle)] hover:bg-[var(--ui-danger-surface)] active:bg-[var(--ui-danger-surface)]";
type ProjectContext=FinanceProjectData&{ stream:typeof projectStreams[number];today:string };

function ExpectedForm({ data,item,project,obligation,onSaved,onPending }: { data:Foundation; item?:FinanceExpected; project?:ProjectContext; obligation?:string; onSaved:()=>void; onPending:(value:boolean)=>void }) {
  const t=useTranslations("Finance"),locale=useLocale();
  const isExpense=project?.stream==="expenses";
  const [direction,setDirection]=useState(item?.direction??(isExpense?"outgoing":"incoming"));
  const confirmedOrders = project?.orders.filter(order => order.status === "confirmed") ?? [];
  const [orderId, setOrderId] = useState(item?.order_id ?? (confirmedOrders.length === 1 ? confirmedOrders[0].id : ""));
  const terms=project?.terms.find((term)=>term.stream===project.stream && (project.stream !== "design" || term.order_id === orderId));
  const defaultCategory=project&&!isExpense?data.categories.find((category)=>!category.archived_at&&category.default_key===({ design:"project_payments",supervision:"supervision",contractor_bonus:"contractor_bonus",other:"other_income",expenses:"" }[project.stream])):null;
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
  const rawExpectedVatRate=item?item.vat_rate??null:(contractDefault?visitTerms?.vat_rate:terms?.vat_rate)??null;
  const expectedVatRate=rawExpectedVatRate===null?null:String(rawExpectedVatRate);
  const rawExpectedPriceBasis=item?item.price_basis??null:(contractDefault?visitTerms?.price_basis:terms?.price_basis)??null;
  const expectedPriceBasis=rawExpectedPriceBasis==="net"||rawExpectedPriceBasis==="gross"?rawExpectedPriceBasis:null;
  let vatPreview="";
  if(expectedVatRate!==null&&effectiveAmount){try{const currencyInfo=data.currencies.find((entry)=>entry.code===effectiveCurrency);if(!currencyInfo)throw new Error("currency");const composition=projectVatAmounts(effectiveAmount||"0",expectedVatRate,contractDefault?(expectedPriceBasis??"net"):"gross",currencyInfo.minor_units);const unchangedSnapshot=item&&String(item.amount??"")===effectiveAmount;vatPreview=`${t("builder.net")} ${formatFinanceAmount(unchangedSnapshot?item.net_amount??composition.net:composition.net,currencyInfo,locale)} · ${t("builder.vat")} ${formatFinanceAmount(unchangedSnapshot?item.vat_amount??composition.vat:composition.vat,currencyInfo,locale)} · ${t("builder.gross")} ${formatFinanceAmount(composition.gross,currencyInfo,locale)}`;}catch{vatPreview="";}}
  if(isExpense&&project) return <FinanceActionForm action={saveFinancePlanning} label={t("planning.save")} onSaved={onSaved} onPending={onPending} disabled={project?.stream === "design" && !orderId}>
    <input type="hidden" name="intent" value="expected"/><input type="hidden" name="id" value={item?.id??""}/><input type="hidden" name="version" value={item?.version??0}/>
    <input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="stream" value="expenses"/><input type="hidden" name="direction" value="outgoing"/>
    <input type="hidden" name="commitment" value={item?.commitment??"agreed"}/><input type="hidden" name="certainty" value={item?.certainty??"fixed"}/><input type="hidden" name="established" value={String(item?.is_established??false)}/><input type="hidden" name="dueDate" value={item?.due_date??""}/>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
      <FormField label={t("movements.amount")}><Input name="amount" value={amount} onChange={(event)=>setAmount(event.target.value)} inputMode="decimal" required/></FormField>
      <FormField label={t("planning.currency")}><FinanceCurrencySelect aria-label={t("planning.currency")} name="currency" currencies={data.currencies} reportingCurrency={data.settings?.base_currency??""} value={currency} onValueChange={setCurrency}/></FormField>
    </div>
    <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
      <FinanceCategorySelect categories={data.categories} direction="outgoing" operatingOnly projectExpenseOnly value={category} onValueChange={setCategory} currentId={item?.category_id}/>
      <FormField label={t("planning.expectedDate")}><DatePicker className="max-w-44" name="expectedDate" aria-label={t("planning.expectedDate")} value={expected} onValueChange={setExpected} locale={locale}/></FormField>
    </div>
    <FormField label={t("movements.description")}><Textarea name="description" defaultValue={item?.description??""} rows={2} maxLength={2000} className="max-h-48 resize-none overflow-y-auto" ref={(element)=>{if(element){element.style.height="auto";element.style.height=`${element.scrollHeight}px`;}}} onInput={(event)=>{event.currentTarget.style.height="auto";event.currentTarget.style.height=`${event.currentTarget.scrollHeight}px`;}}/></FormField>
  </FinanceActionForm>;
  return <FinanceActionForm action={saveFinancePlanning} label={t("planning.save")} onSaved={onSaved} onPending={onPending} disabled={project?.stream === "design" && !orderId}>
    <input type="hidden" name="intent" value="expected"/><input type="hidden" name="id" value={item?.id??""}/><input type="hidden" name="version" value={item?.version??0}/>
    {project?<><input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="stream" value={project.stream}/>
      {project.stream === "design" ? <><input type="hidden" name="orderId" value={orderId}/>{!item && confirmedOrders.length > 1 ? <FormField label={t("orders.order")}><Select aria-label={t("orders.order")} value={orderId} required onValueChange={id => { setOrderId(id); const next = project.terms.find(term => term.order_id === id); if(next?.currency) setCurrency(next.currency); }}><SelectItem value="">{t("orders.choose")}</SelectItem>{confirmedOrders.map(order=><SelectItem key={order.id} value={order.id}>{order.name}</SelectItem>)}</Select></FormField> : <p className="text-sm text-[var(--ui-text-secondary)]">{confirmedOrders.find(order=>order.id===orderId)?.name}</p>}</> : null}
      {item&&!isExpense?<p className="text-xs text-[var(--ui-text-muted)]">{t("project.editHelp")}</p>:!item?<>
        {project.stream==="supervision"?<><FormField label={t("project.chargeSource")}><Select name="source" aria-label={t("project.chargeSource")} value={source} onValueChange={setSource}><SelectItem value="manual">{t("project.manualCharge")}</SelectItem><SelectItem value="visit">{t("project.visitCharge")}</SelectItem></Select></FormField>
          {source==="visit"?<><FormField label={t("project.visit")}><Select name="visitId" aria-label={t("project.visit")} value={visit} onValueChange={setVisit} required searchPlaceholder={t("project.searchVisits")}>{project.visits.map((v)=><SelectItem key={v.id} value={v.id}>{v.title} · {formatDateOnly(instantToDateOnly(v.starts_at),locale)}</SelectItem>)}</Select></FormField><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={extraVisit} required={monthlyExtra} onChange={(e)=>setExtraVisit(e.target.checked)}/>{t("project.extraVisit")}</label><input type="hidden" name="extraVisit" value={String(extraVisit)}/></>:null}</>:null}
        {project.stream==="contractor_bonus"?<FormField label={t("project.contractor")}><Select name="contractorId" aria-label={t("project.contractor")} value={contractor} onValueChange={setContractor} searchPlaceholder={t("project.searchContractors")}><SelectItem value="">{t("project.noContractor")}</SelectItem>{project.contractors.map((c)=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</Select></FormField>:null}
      </>:null}</>:null}
    {selectedVisit?<><input type="hidden" name="visitPricing" value={contractDefault?"contract":"manual"}/><input type="hidden" name="visitTermsId" value={visitTerms?.id??""}/><input type="hidden" name="useAgreementBasis" value={String(contractDefault)}/>
      {visitTerms?.mode==="per_visit"?<div className="space-y-2 text-sm"><p>{t("project.contractVisitPrice",{amount:visitTerms.amount??0,currency:visitTerms.currency})}</p><label className="flex items-start gap-2"><input type="checkbox" checked={priceOverride} onChange={(e)=>{if(e.target.checked){setAmount(effectiveAmount);setCurrency(effectiveCurrency);setAmountEntered(true);setCurrencyEntered(true);}setPriceOverride(e.target.checked);}}/>{t("project.overrideVisitPrice")}</label></div>:null}
    </>:null}
    {obligation?<p className="text-xs text-[var(--ui-text-muted)]">{t("schedules.sourceHelp")}</p>:null}
    {project||obligation?<input type="hidden" name="direction" value={item?.direction??(isExpense?"outgoing":"incoming")}/>:<fieldset><legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("planning.direction")}</legend><div className="inline-flex rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["incoming","outgoing"] as const).map((value)=><label key={value} className="relative cursor-pointer"><input className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" type="radio" name="direction" value={value} checked={direction===value} onChange={()=>{setDirection(value);setCategory("");}}/><span className="flex min-h-11 items-center rounded-[calc(var(--ui-radius-control)-2px)] px-4 text-sm text-[var(--ui-text-secondary)] peer-checked:bg-[var(--ui-surface)] peer-checked:font-semibold peer-checked:text-[var(--ui-text)] peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ui-focus)]">{t(value==="incoming"?"planning.income":"planning.expenses")}</span></label>)}</div></fieldset>}
    <div className={`grid gap-4 ${obligation?"":"sm:grid-cols-2"}`}>
    <div className="space-y-1">
      <div className={`grid gap-3 ${obligation?"":"grid-cols-[minmax(0,1fr)_8rem]"}`}>
        <FormField label={project&&!isExpense&&expectedVatRate?(contractDefault?t("project.agreementPrice"):t("project.clientAmount")):t("movements.amount")}><Input name="amount" readOnly={fixedPayroll||contractDefault} value={effectiveAmount} onChange={(e)=>{setAmount(e.target.value);setAmountEntered(true);if(monthlyExtra)setPriceOverride(true);}} inputMode="decimal" required/></FormField>
        {contractDefault?<FormField label={t("planning.currency")}><Input name="currency" value={effectiveCurrency} readOnly/></FormField>:obligation?<input type="hidden" name="currency" value={currency}/>:<FormField label={t("planning.currency")}><FinanceCurrencySelect aria-label={t("planning.currency")} name="currency" currencies={data.currencies} reportingCurrency={data.settings?.base_currency??""} value={effectiveCurrency} onValueChange={(value)=>{setCurrency(value);setCurrencyEntered(true);if(monthlyExtra)setPriceOverride(true);}}/></FormField>}
      </div>
      {vatPreview?<p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{vatPreview}</p>:null}
      {!fixedPayroll?<label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={estimated} onChange={(event)=>setEstimated(event.target.checked)} className="size-4"/>{t("planning.estimatedAmount")}</label>:null}
    </div>
    {obligation?<input type="hidden" name="categoryId" value={category}/>:<FinanceCategorySelect categories={data.categories} direction={direction} operatingOnly={isExpense} owner={data.categories.find((c)=>c.id===item?.category_id)?.nature==="owner_distribution"} value={category} onValueChange={setCategory} currentId={item?.category_id}/>}
    </div>
    {isExpense?<><input type="hidden" name="dueDate" value={due}/><FormField label={t("planning.expectedDate")}><DatePicker name="expectedDate" aria-label={t("planning.expectedDate")} value={expected} onValueChange={setExpected} locale={locale}/></FormField></>:<div className="space-y-1">
      <div className="grid gap-4 sm:grid-cols-2">
        {obligation?<input type="hidden" name="dueDate" value={due}/>:<FormField label={t("planning.dueDate")}><DatePicker name="dueDate" aria-label={t("planning.dueDate")} value={due} onValueChange={(value)=>{setDue(value);if(!separateExpected)setExpected(value);}} locale={locale}/></FormField>}
        {separateExpected?<FormField label={t("planning.expectedDate")}><DatePicker name="expectedDate" aria-label={t("planning.expectedDate")} value={expected} onValueChange={setExpected} locale={locale}/></FormField>:<input type="hidden" name="expectedDate" value={expected}/>}
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={separateExpected} onChange={(event)=>{setSeparateExpected(event.target.checked);if(!event.target.checked)setExpected(due);}} className="size-4"/>{t("planning.differentExpectedDate")}</label>
    </div>}
    <input type="hidden" name="certainty" value={estimated?"estimated":"fixed"}/><input type="hidden" name="established" value={String(effectiveEstablished)}/>
    {item?<FormField label={t("planning.agreementState")}><Select name="commitment" aria-label={t("planning.agreementState")} value={commitment} onValueChange={setCommitment}>{(project&&item.commitment!=="cancelled"?["agreed","tentative"]:["agreed","tentative","cancelled"]).map((value)=><SelectItem key={value} value={value}>{t(`planning.agreementOptions.${value}`)}</SelectItem>)}</Select></FormField>:<div>
      <input type="hidden" name="commitment" value={commitment}/>
      <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={commitment==="tentative"} onChange={(event)=>setCommitment(event.target.checked?"tentative":"agreed")} className="size-4"/>{t("planning.plannedPayment")}</label>
      {commitment==="tentative"?<p className="pl-7 text-xs text-[var(--ui-text-muted)]">{t("planning.plannedPaymentHelp")}</p>:null}
    </div>}
    {isExpense?<FormField label={t("movements.description")}><Textarea name="description" defaultValue={item?.description??""} rows={2} maxLength={2000} required/></FormField>:<details open={Boolean(item?.description)} className="group/description rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] text-sm text-[var(--ui-text-secondary)]"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("movements.description")}<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open/description:rotate-180"/></summary><div className="border-t border-[var(--ui-border)] p-3"><Textarea aria-label={t("movements.description")} name="description" defaultValue={item?.description??""} rows={2} maxLength={2000}/></div></details>}
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

export function FinanceExpectedWorkspace(props:Foundation&FinancePlanningData&{ page:number;creditPage:number;filter:string;period?:FinancePlanningPeriod;today?:string;project?:ProjectContext;itemId?:string;toolbar?:ReactNode;onManageOrder?:(orderId?:string)=>void;cashData?:FinanceProjectCash|null;attention?:"overdue";status?:"overdue"|"cancelled" }) {
  const t=useTranslations("Finance"),locale=useLocale();
  const router=useRouter();
  const [editing,setEditing]=useState<FinanceExpected|"new"|null>(null);
  const [costEditing,setCostEditing]=useState<FinancePlanningData["payrollCosts"][number]|null>(null);
  const [savedCost,setSavedCost]=useState<FinancePlanningData["payrollCosts"][number]|null>(null);
  const [cancelling,setCancelling]=useState<FinanceExpected|null>(null);
  const [matching,setMatching]=useState<FinanceExpected|null>(null);
  const [recording,setRecording]=useState<FinanceExpected|null>(null);
  const [equivalentCurrency,setEquivalentCurrency]=useState("");
  const [equivalentQuotes,setEquivalentQuotes]=useState<Record<string,Awaited<ReturnType<typeof quoteFinanceSettlement>>>>({});
  const [paymentId,setPaymentId]=useState("");
  const [releasing,setReleasing]=useState<string|null>(null);
  const [historyItemId, setHistoryItemId] = useState<string | null>(null);
  const [closingRemainderId, setClosingRemainderId] = useState<string | null>(null);
  const closingCandidate = props.items.find(item => item.id === closingRemainderId);
  const closingRemainder = closingCandidate && closingCandidate.commitment !== "cancelled" && Number(closingCandidate.remaining_amount) > 0 && Number(closingCandidate.settled_amount) > 0 ? closingCandidate : null;
  useEffect(() => { if (closingRemainderId && !closingRemainder) setClosingRemainderId(null); }, [closingRemainderId, closingRemainder]);
  const [reversingClosure, setReversingClosure] = useState<string | null>(null);
  const [cashToMatch, setCashToMatch] = useState<string | null>(null);
  const historyItem = props.items.find(item => item.id === historyItemId);
  const [cashOptions, setCashOptions] = useState<Awaited<ReturnType<typeof getProjectCashMatchOptions>>>(null);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashError, setCashError] = useState(false);
  const cashCandidate = cashOptions?.payment;
  const cashProjectId = props.project?.projectId;
  useEffect(() => {
    if (!cashToMatch || !cashProjectId) return;
    let current = true;
    setCashLoading(true); setCashError(false); setCashOptions(null);
    getProjectCashMatchOptions(cashProjectId, cashToMatch).then(options => {
      if (current) setCashOptions(options);
    }).catch(() => { if (current) setCashError(true); }).finally(() => { if (current) setCashLoading(false); });
    return () => { current = false; };
  }, [cashToMatch, cashProjectId]);
  const [pending,setPending]=useState(false);
  useEffect(() => {
    if (!props.itemId) return;
    const row = document.getElementById(`expected-${props.itemId}`);
    row?.scrollIntoView({ block: "center" });
    if (props.project) row?.focus({ preventScroll: true });
  }, [props.itemId, props.project?.projectId]);
  const money=(amount:string|number|null,code:string|null)=>{const currency=props.currencies.find((item)=>item.code===code);return currency?formatFinanceAmount(amount??0,currency,locale):`${amount??0} ${code??""}`;};
  const categoryLabel=(id:string|null)=>financeCategoryLabel(props.categories.find((item)=>item.id===id),"",(key)=>t(`planning.defaults.${key}`));
  const paymentLabel=(payment:FinancePlanningData["payments"][number])=>payment.description||financeMovementCategoryLabel(payment.category_id,payment.category,props.categories,(key)=>t(`planning.defaults.${key}`));
  const date=(value:string|null)=>value?formatDateOnly(value,locale):"—";
  const period=props.period??"all",today=props.project?.today??props.today??new Date().toISOString().slice(0,10),currentMonth=today.slice(0,7);
  const equivalentChoices=props.project&&props.project.stream!=="expenses"?[...new Set(props.accounts.filter((account)=>!account.archived_at).map((account)=>account.currency))].filter((code)=>props.items.some((item)=>item.currency&&item.currency!==code)):[];
  const selectedEquivalent=equivalentChoices.includes(equivalentCurrency)?equivalentCurrency:"";
  useEffect(()=>{
    if (!props.project || !selectedEquivalent) return;
    const rows=props.items.filter((item)=>item.id&&item.currency&&item.currency!==selectedEquivalent);
    let current=true;
    quoteFinanceSchedule(rows.map((item)=>({currency:item.currency??"",obligationCurrency:selectedEquivalent,date:item.expected_payment_date??item.due_date??today}))).then((quotes)=>{
      if (!current) return;
      const next:Record<string,Awaited<ReturnType<typeof quoteFinanceSettlement>>>={};
      rows.forEach((item,index)=>{if(item.id)next[`${item.id}:${selectedEquivalent}:${item.expected_payment_date??item.due_date??today}`]=quotes[index]??null;});
      setEquivalentQuotes(next);
    }).catch(()=>{if(current){const next:Record<string,null>={};rows.forEach((item)=>{if(item.id)next[`${item.id}:${selectedEquivalent}:${item.expected_payment_date??item.due_date??today}`]=null;});setEquivalentQuotes(next);}});
    return ()=>{current=false;};
  },[props.project,props.items,selectedEquivalent,today]);
  const href=(page=props.page,credits=props.creditPage,filter=props.filter,nextPeriod=period,nextAttention: "overdue"|null|undefined=props.attention,nextStatus: "overdue"|"cancelled"|null|undefined=props.status)=>{if(props.project)return `/projects/${props.project.projectId}?view=finance&financeTab=${props.project.stream === "expenses" ? "expenses" : "payments"}&stream=${props.project.stream}&page=${page}&credits=${credits}&filter=${filter}`;const params=new URLSearchParams({page:String(page),credits:String(credits),filter,period:nextPeriod});if(nextStatus)params.set("status",nextStatus);else if(nextAttention)params.set("attention",nextAttention);return `/finance/expected?${params}`;};
  const matchingNature=props.categories.find((category)=>category.id===matching?.category_id)?.nature;
  const availablePayments = cashCandidate && !props.payments.some(payment => payment.id === cashCandidate.id) ? [...props.payments, cashCandidate] : props.payments;
  const candidates=availablePayments.filter((payment)=>payment.currency===matching?.currency&&payment.direction===matching?.direction&&payment.nature===matchingNature);
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
    const category=categoryLabel(item.category_id);
    const project=link?.project?.name ? projectPaymentPresentation(item.description,link.project.name,t(`movements.kinds.${item.direction}`),link.stream==="expenses"?category:t("planning.projectPayment")) : null;
    const title=project?.title??titleFor(item),rowDate=item.expected_payment_date??item.due_date;
    const employerLink=obligation?.component==="payout"?props.obligations.find((entry)=>entry.obligation_id===obligation.obligation_id&&entry.component==="employer_cost"):undefined;
    const employerItem=props.items.find((entry)=>entry.id===employerLink?.expected_item_id);
    const context=contextPeriod?(obligation?.obligation.kind==="payroll"?t("planning.forPeriod",{period:monthLabel(contextPeriod)}):monthLabel(contextPeriod)):link?.context_label??null;
    const subtitle=project?.context??context??(category!==title?category:null);
    const state=item.commitment==="cancelled"?t("planning.agreementOptions.cancelled"):!active && Number(item.adjustment_amount ?? 0) > 0 ? t("settlement.closed") :item.payment_state==="partial"?t("planning.states.partial"):active&&item.due_state==="overdue"?t("planning.states.overdue"):item.payment_state==="settled"?t("planning.states.settled"):item.commitment==="tentative"?t("planning.agreementOptions.tentative"):item.certainty==="estimated"?t("planning.estimatedAmount"):item.due_state==="due"?t("planning.states.due"):!rowDate?t("planning.states.unscheduled"):t("planning.states.unpaid");
    const settled=item.payment_state==="settled";
    const stateClass=active&&item.due_state==="overdue"?"bg-[var(--ui-danger-surface)] font-semibold text-[var(--ui-danger-text)]":item.payment_state==="partial"?"bg-[var(--ui-warning-surface)] font-medium text-[var(--ui-warning-text)]":item.payment_state==="settled"||item.commitment==="cancelled"?"bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]":"bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]";
    const equivalentQuote=item.id?equivalentQuotes[`${item.id}:${selectedEquivalent}:${item.expected_payment_date??item.due_date??today}`]:undefined;
    const equivalentTarget=props.currencies.find((currency)=>currency.code===selectedEquivalent);
    const equivalentSource=props.currencies.find((currency)=>currency.code===item.currency);
    const equivalentAmount=equivalentQuote&&equivalentTarget&&equivalentSource?indicativeFinanceConversion(item.amount??0,equivalentQuote.rate,equivalentSource.minor_units,equivalentTarget.minor_units):null;
    const amountClass=settled&&props.project?"text-[var(--ui-text-secondary)]":(item.direction==="incoming"?"text-[var(--ui-success-text)]":"text-[var(--ui-danger-text)]")+(settled?" opacity-70":"");
    const TypeIcon=obligation?.obligation.kind==="payroll"?Banknote:project?BriefcaseBusiness:obligation?.obligation.kind==="recurring"||link?.source==="monthly"?RefreshCw:item.direction==="incoming"?ArrowDownLeft:ArrowUpRight;
    const typeIconClass=obligation?.obligation.kind==="payroll"||project||obligation?.obligation.kind==="recurring"||link?.source==="monthly"?"bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]":item.direction==="incoming"?"bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]":"bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]";
    if (props.project) {
      const note = props.project.planItems.find(planItem => planItem.id === item.id)?.client_note;
      return <ProjectPaymentRow key={item.id} id={item.id ?? ""} title={title} date={rowDate ? (item.expected_payment_date ? t("planning.timingExpected", { date: shortDate(rowDate) }) : t("planning.timingDue", { date: shortDate(rowDate) })) : t("planning.timingMissing")}
        amount={`${item.certainty === "estimated" ? "≈ " : ""}${money(item.amount, item.currency)}`} status={state} statusClass={stateClass}
        progress={item.payment_state === "partial" || Number(item.adjustment_amount ?? 0) > 0 ? t("planning.settlementProgress", { paid: money(item.settled_amount, item.currency), remaining: money(item.remaining_amount, item.currency) }) : undefined}
        equivalent={selectedEquivalent && item.currency !== selectedEquivalent ? equivalentAmount && equivalentTarget ? `≈ ${formatFinanceAmount(equivalentAmount, equivalentTarget, locale)} · ${equivalentQuote?.effectiveDate === today ? t("planning.equivalentToday") : t("planning.equivalentDated", { date: date(equivalentQuote?.effectiveDate ?? today) })}` : equivalentQuote === null ? t("planning.equivalentUnavailable") : t("planning.equivalentLoading") : undefined}
        open={props.itemId === item.id} hasDetails={Boolean(props.project.stream === "expenses" || note || (link?.context_label && link.context_label !== title) || (item.expected_payment_date && item.due_date && item.expected_payment_date !== item.due_date))} expense={props.project.stream === "expenses"}
        onRecord={active ? () => setRecording(item) : undefined}
        onEdit={!tripLink ? () => setEditing(item) : undefined}
        onMatch={active ? () => { setPaymentId(""); setMatching(item); } : undefined}
        onCancel={link && item.commitment !== "cancelled" ? () => setCancelling(item) : undefined}
        onHistory={history.length || props.adjustments.some(entry => entry.expected_item_id === item.id) ? () => setHistoryItemId(item.id) : undefined}
        onCloseRemainder={active && item.direction === "incoming" && Number(item.settled_amount) > 0 && props.categories.find(category => category.id === item.category_id)?.nature === "operating" ? () => setClosingRemainderId(item.id) : undefined}
        tripHref={tripLink ? `/finance/trips/${tripLink.trip_id}` : undefined}>
        {props.project.stream === "expenses" ? <p>{category}</p> : null}
        {note ? <p className="whitespace-pre-wrap">{note}</p> : null}
        {link?.context_label && link.context_label !== title ? <p>{link.context_label}</p> : null}
        {item.expected_payment_date && item.due_date && item.expected_payment_date !== item.due_date ? <p>{t("planning.dueDate")}: {date(item.due_date)} · {t("planning.expectedDate")}: {date(item.expected_payment_date)}</p> : null}
        {history.length ? <button type="button" className="min-h-11 font-medium underline underline-offset-4" onClick={() => setHistoryItemId(item.id)}>{t("projectWorkspace.history")} · {history.length}</button> : null}
      </ProjectPaymentRow>;
    }
    return <article key={item.id} id={`expected-${item.id}`} data-direction={item.direction}>
      <details data-finance-motion className={"group overflow-hidden rounded-[var(--ui-radius-control)] border transition-[border-color,box-shadow,background-color] duration-200 open:border-[var(--ui-border)] open:shadow-[var(--ui-shadow-panel)] "+(props.project&&settled?"border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)]":"border-[var(--ui-border-subtle)] bg-[var(--ui-surface)]")} open={props.itemId===item.id}><summary aria-label={t("planning.detailsNamed",{name:project?`${title} · ${project.context}`:title})} className={`grid min-h-20 cursor-pointer list-none ${props.project?"grid-cols-[minmax(0,1fr)_1rem]":"grid-cols-[minmax(0,1fr)_auto_1rem]"} items-center gap-x-3 gap-y-1 px-3 py-3 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] active:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none md:min-h-16 md:grid-cols-[8.5rem_minmax(0,1fr)_minmax(7.5rem,auto)_minmax(10rem,auto)_1rem] md:gap-x-5 md:px-4`}>
        <span className={`col-start-1 row-start-2 pl-11 text-xs md:col-start-1 md:row-start-1 md:pl-0 ${active&&item.due_state==="overdue"?"font-medium text-[var(--ui-danger-text)]":props.project&&!settled?"text-[var(--ui-text-secondary)]":"text-[var(--ui-text-muted)]"}`}>{rowDate?(item.expected_payment_date?t("planning.timingExpected",{date:shortDate(rowDate)}):t("planning.timingDue",{date:shortDate(rowDate)})):t("planning.timingMissing")}</span>
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 md:col-start-2"><span className={`flex size-9 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] ${typeIconClass}`}><TypeIcon aria-hidden="true" className="size-[1.125rem]"/></span><div className="min-w-0"><h3 className={`break-words text-sm font-semibold leading-snug ${props.project?"text-[var(--ui-text)]":settled?"text-[var(--ui-text-secondary)]":"text-[var(--ui-text)]"}`}>{title}</h3>{subtitle?<p className={props.project&&!settled?"mt-0.5 break-words text-xs text-[var(--ui-text-secondary)]":"mt-0.5 break-words text-xs text-[var(--ui-text-muted)]"}>{subtitle}</p>:null}</div></div>
        <span className={`col-start-1 row-start-3 ml-11 inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] leading-5 md:col-start-3 md:row-start-1 md:ml-0 ${stateClass}`}>{props.project&&settled?<CircleCheck aria-hidden="true" className="size-3.5 text-[var(--ui-success-text)]"/>:null}{state}</span>
        <strong className={`ui-numeric ${props.project?"col-start-1 row-start-4 ml-11 text-left md:ml-0 md:text-right":"col-start-2 row-span-3 row-start-1 text-right"} whitespace-nowrap text-base font-bold md:col-start-4 md:row-start-1 md:row-span-1 md:text-lg ${amountClass}`}>{item.certainty==="estimated"?"≈ ":""}{props.project ? "" : item.direction==="incoming"?"+":"−"}{money(item.amount,item.currency)}{props.project&&selectedEquivalent&&item.currency!==selectedEquivalent?<span className="mt-0.5 block max-w-64 whitespace-normal text-xs font-normal text-[var(--ui-text-muted)]">{equivalentAmount&&equivalentTarget?`≈ ${formatFinanceAmount(equivalentAmount,equivalentTarget,locale)} · ${equivalentQuote?.effectiveDate===today?t("planning.equivalentToday"):t("planning.equivalentDated",{date:formatDateOnly(equivalentQuote?.effectiveDate??today,locale)})}`:equivalentQuote===null?t("planning.equivalentUnavailable"):t("planning.equivalentLoading")}</span>:null}{props.project&&item.payment_state==="partial"?<span className="mt-1 block max-w-48 whitespace-normal text-xs font-normal text-[var(--ui-text-secondary)]">{t("planning.settlementProgress",{paid:money(item.settled_amount,item.currency),remaining:money(item.remaining_amount,item.currency)})}</span>:null}</strong>
        <ChevronDown className={`${props.project?"col-start-2 row-span-4":"col-start-3 row-span-3"} row-start-1 size-4 text-[var(--ui-text-muted)] transition-transform duration-[220ms] group-open:rotate-180 motion-reduce:transition-none md:col-start-5 md:row-span-1`} aria-hidden="true"/>
      </summary><div className={"grid border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface-muted)] px-3 text-sm md:px-4 "+(props.project?"gap-2 py-3":"gap-4 pb-4 pt-3 xl:grid-cols-[minmax(0,1fr)_minmax(12rem,17rem)]")}>
        <div className="min-w-0">
        {obligation?.obligation.kind==="payroll"?<dl className="grid gap-x-6 gap-y-4 text-xs sm:grid-cols-2 2xl:grid-cols-4">
          <div className="min-w-0"><dt className="text-[var(--ui-text-muted)]">{t("schedules.components.payout")}</dt><dd className="break-words font-medium">{obligation.obligation.employee_name??title}</dd></div>
          <div><dt className="text-[var(--ui-text-muted)]">{t("schedules.period")}</dt><dd>{date(obligation.obligation.period_start)} – {date(obligation.obligation.period_end)}</dd></div>
          <div><dt className="text-[var(--ui-text-muted)]">{t("planning.dueDate")}{item.expected_payment_date&&item.expected_payment_date!==item.due_date?` / ${t("planning.expectedDate")}`:""}</dt><dd>{date(item.due_date)}{item.expected_payment_date&&item.expected_payment_date!==item.due_date?` / ${date(item.expected_payment_date)}`:""}</dd></div>
          <div><dt className="text-[var(--ui-text-muted)]">{t(`schedules.components.${obligation.component}`)}</dt><dd className="ui-numeric font-medium">{money(item.amount,item.currency)} · {state}</dd>{item.payment_state==="partial"?<dd>{t("planning.settlementProgress",{paid:money(item.settled_amount,item.currency),remaining:money(item.remaining_amount,item.currency)})}</dd>:null}</div>
          {employerItem?<div><dt className="text-[var(--ui-text-muted)]">{t("schedules.components.employer_cost")}</dt><dd className="ui-numeric font-medium">{money(employerItem.amount,employerItem.currency)} · {t(`planning.states.${employerItem.payment_state}`)}</dd></div>:null}
          {obligation.component==="payout"?props.payrollCosts.filter((cost)=>cost.obligation_id===obligation.obligation_id&&(!employerItem||cost.component!=="employer_cost")).map((cost)=><div key={cost.component}><dt className="text-[var(--ui-text-muted)]">{t(`schedules.components.${cost.component}`)}</dt><dd className="ui-numeric font-medium">{cost.status==="unknown"?t("schedules.unknown"):`${money(cost.amount,cost.currency)} · ${t(`schedules.${cost.status}`)}`}</dd>{cost.can_complete?<dd><Button size="sm" variant="ghost" disabled={savedCost?.obligation_id===cost.obligation_id&&savedCost?.component===cost.component&&savedCost?.revision===cost.revision} onClick={()=>setCostEditing(cost)}>{t("schedules.completeCost")}</Button></dd>:null}</div>):null}
        </dl>:<dl className={props.project?"grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]":"grid gap-x-6 gap-y-4 text-xs sm:grid-cols-2 2xl:grid-cols-4"}>
          <div className="min-w-0"><dt className="text-[var(--ui-text-muted)]">{t("movements.type")}</dt><dd className="break-words">{t(`movements.kinds.${item.direction}`)} · {categoryLabel(item.category_id)}{project?` · ${project.context}`:context?` · ${context}`:""}{link?.context_label?` · ${link.context_label}`:""}</dd></div>
          <div><dt className="text-[var(--ui-text-muted)]">{t("planning.dueDate")}</dt><dd>{date(item.due_date)}</dd></div>
          {item.expected_payment_date&&item.expected_payment_date!==item.due_date?<div><dt className="text-[var(--ui-text-muted)]">{t("planning.expectedDate")}</dt><dd>{date(item.expected_payment_date)}</dd></div>:null}
          {obligation?.obligation.kind==="recurring"?<div><dt className="text-[var(--ui-text-muted)]">{t("movements.amount")}</dt><dd>{item.certainty==="estimated"?"≈ ":""}{money(item.amount,item.currency)}</dd></div>:null}
          <div><dt className="text-[var(--ui-text-muted)]">{t("planning.agreementState")}</dt><dd>{t(`planning.agreementOptions.${item.commitment}`)} · {state}</dd></div>
          {item.payment_state==="partial"?<div><dt className="text-[var(--ui-text-muted)]">{t("planning.states.partial")}</dt><dd className="ui-numeric">{t("planning.settlementProgress",{paid:money(item.settled_amount,item.currency),remaining:money(item.remaining_amount,item.currency)})}</dd></div>:null}
        </dl>}
        </div>
        <div className={props.project?"flex flex-wrap items-center gap-1.5 self-start rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] p-1.5":"flex flex-wrap items-center gap-1 self-start rounded-[var(--ui-radius-control)] bg-[var(--ui-surface)] p-2 xl:flex-col xl:items-stretch"}>{active?(props.project?<Button size="sm" className="active:bg-[var(--ui-action-primary-hover)]" onClick={()=>setRecording(item)}>{t("planning.recordPayment")}</Button>:<Button asChild size="sm"><Link href={`/finance/movements?expected=${item.id}`}>{t("planning.recordPayment")}</Link></Button>):null}{tripLink?<Link className={props.project?projectActionClass+" flex h-8 items-center rounded-[var(--ui-radius-control)] px-3 text-xs text-[var(--ui-text-secondary)]":"px-2 py-1.5 text-xs underline"} href={`/finance/trips/${tripLink.trip_id}`}>{t("trips.title")}</Link>:link&&!props.project?<Link className="px-2 py-1.5 text-xs underline" href={`/projects/${link.project_id}?view=finance&stream=${link.stream}`}>{link.project?.name??t("project.open")}</Link>:<Button size="sm" variant="ghost" className={props.project?projectActionClass:undefined} onClick={()=>setEditing(item)}>{t("edit")}</Button>}{active?<Button size="sm" variant="ghost" className={props.project?projectActionClass:undefined} onClick={()=>{setPaymentId("");setMatching(item);}}>{t("planning.match")}</Button>:null}{link&&item.commitment!=="cancelled"?<Button size="sm" variant="ghost" className={props.project?projectDestructiveActionClass:undefined} onClick={()=>setCancelling(item)}>{t("project.cancelExpectation")}</Button>:null}</div>
        {history.length?<div className={props.project?"border-t border-[var(--ui-border-subtle)] pt-2":"rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3 xl:col-span-2"}>
          <p className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("planning.history")}</p>
          <ul className="mt-1 space-y-2 text-xs">{history.map((entry)=>{
            const remaining=entry.amount+history.filter((release)=>release.released_allocation_id===entry.id).reduce((sum,release)=>sum+release.amount,0);
            const crossCash=props.project&&entry.amount>0&&entry.cash&&entry.cash.currency!==item.currency?entry.cash:null;
            return <li key={entry.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 break-words">
              <span className="text-[var(--ui-text-muted)]">{date(entry.movement.financial_date)}</span>
              <span className="ui-numeric font-medium text-[var(--ui-text)]">{props.project&&entry.amount>0?t("planning.states.settled")+": ":null}{money(entry.amount,item.currency)}</span>
              {!props.project||entry.amount<0?<span className="text-[var(--ui-text-secondary)]">{entry.amount<0?t(entry.cause_movement_id?"planning.cashRelease":"planning.manualRelease"):t("planning.matched")}</span>:null}
              {crossCash?<div className="basis-full space-y-0.5 text-[var(--ui-text-secondary)]">
                <p>{t(item.direction==="incoming"?"planning.actualReceived":"planning.actualPaid")}: <span className="ui-numeric font-medium text-[var(--ui-text)]">{money(String(crossCash.amount).replace(/^-/, ""),crossCash.currency)}</span></p>
                <p className="text-[var(--ui-text-muted)]">{t("movements.settlementRateCompact",{currency:crossCash.currency,obligation:item.currency??"",rate:formatFinanceDecimal(entry.settlement_rate,locale,{maximumFractionDigits:10}),source:t(entry.settlement_source==="nbu"?"movements.nbuShort":"movements.manualShort"),date:date(entry.settlement_effective_date)})}</p>
              </div>:null}
              {entry.amount>0&&remaining>0&&!tripLink?.cash?<Button size="sm" variant="ghost" onClick={()=>setReleasing(entry.id)}>{t("planning.unmatch")}</Button>:null}
            </li>;
          })}</ul>
        </div>:null}
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
  function renderOrderGroups() {
    if (!props.project) return null;
    const confirmed = props.project.orders.filter(order => order.status === "confirmed");
    return <div className="space-y-6">{confirmed.map(order => {
      const rows = props.items.filter(item => props.links.find(link => link.expected_item_id === item.id)?.order_id === order.id);
      const total = props.project?.orderTotals.find(total => total.order_id === order.id);
      if (!rows.length && Number(total?.payment_count) > 0) return null;
      return <section key={order.id} data-order-group={order.id} aria-label={order.name} className="space-y-2">
        <div className="flex items-start justify-between gap-3 px-1"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{order.is_default && order.name !== t("orders.defaultName") ? <span className="font-normal text-[var(--ui-text-secondary)]">{t("orders.defaultBadge")} · </span> : null}{order.name}</h3><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{money(total?.contract_gross_amount ?? null,total?.currency ?? null)} · {t("orders.payments",{count:total?.payment_count ?? 0})}</p></div><Button variant="ghost" size="sm" onClick={()=>props.onManageOrder?.(order.id)}>{t("orders.details")}</Button></div>
        {rows.length ? <div className="space-y-1.5">{rows.map(renderItem)}</div> : <div className="flex flex-wrap items-center gap-2 px-1 text-sm text-[var(--ui-text-secondary)]"><p>{t("orders.noSchedule")}</p><Button variant="ghost" size="sm" onClick={()=>props.onManageOrder?.(order.id)}>{t("orders.configure")}</Button></div>}
      </section>;
    })}{!confirmed.length ? <p className="py-4 text-sm text-[var(--ui-text-secondary)]">{t("orders.allDrafts")}</p> : null}</div>;
  }
  const secondaryActive=Boolean(props.status);
  const secondaryFilters=["all","overdue","cancelled"] as const;
  const secondaryHref=(filter:typeof secondaryFilters[number])=>filter==="all"?href(1,props.creditPage,props.filter,period,null,null):filter==="overdue"?href(1,props.creditPage,props.filter,period,null,"overdue"):href(1,props.creditPage,props.filter,period,null,"cancelled");
  return <div className={`w-full min-w-0 ${props.project ? "space-y-3" : "space-y-6"}`}>
    {props.project?<div className="flex flex-wrap items-center gap-2">{props.toolbar ?? <h2 className="mr-auto text-base font-semibold sm:text-lg">{t(`project.streams.${props.project.stream}`)}</h2>}
      {props.cashData ? <ProjectCashWorkspace data={props.cashData} currencies={props.currencies} projectId={props.project.projectId} onMatch={setCashToMatch}/> : null}
      <div className="flex items-center gap-2">
      {equivalentChoices.length ? <Popover.Root><Popover.Trigger asChild><Button size="sm" variant="ghost" className="size-11 p-0"><span className="sr-only">{t("projectWorkspace.listOptions")}</span><MoreHorizontal aria-hidden="true" className="size-4"/></Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={4} collisionPadding={8} className="z-[80] rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow-popover)]"><FormField label={t("planning.equivalent")}><Select aria-label={t("planning.equivalent")} value={selectedEquivalent} onValueChange={value => { setEquivalentCurrency(value); setEquivalentQuotes({}); }}><SelectItem value="">{t("planning.equivalentOff")}</SelectItem>{equivalentChoices.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</Select></FormField></Popover.Content></Popover.Portal></Popover.Root> : null}
      {props.settings?.finalized_at && (props.project.stream !== "design" || props.project.orders.some(order=>order.status==="confirmed")) ? <Button className="min-h-11 gap-2" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true"/><span className="sm:hidden">{t("projectWorkspace.add")}</span><span className="hidden sm:inline">{t(props.project.stream === "expenses" ? "project.addExpense" : "project.addPayment")}</span></Button> : null}
    </div></div>:<header className="flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><h1 className="text-3xl font-semibold tracking-tight text-[var(--ui-text)] sm:text-4xl">{t("planning.title")}</h1><p className="mt-1 max-w-3xl text-sm text-[var(--ui-text-muted)]">{t("planning.description")}</p></div>{props.settings?.finalized_at?<Button className="min-h-11 gap-2" onClick={()=>setEditing("new")}><Plus className="size-4" aria-hidden="true"/>{t("planning.create")}</Button>:null}</header>}
    {!props.settings?.finalized_at?<p className={`${panel} p-5 text-sm`}>{t("movements.setupRequired")} <Link href="/finance/accounts" className="underline">{t("movements.setupLink")}</Link></p>:null}
    {!props.project?<div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-1"><span className="pl-2 text-[11px] font-medium text-[var(--ui-text-muted)]">{t("planning.periodFilters.label")}</span><nav aria-label={t("planning.periodFilters.label")} className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["month","30days","3months","6months","all"] as const).map((value)=><Link key={value} href={href(1,props.creditPage,props.filter,value)} aria-current={period===value?"page":undefined} className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:bg-[var(--ui-surface)] hover:text-[var(--ui-text)] active:bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:text-[var(--ui-text)] aria-[current=page]:shadow-[var(--ui-shadow-panel)] sm:min-h-9">{t(`planning.periodFilters.${value}`)}</Link>)}</nav></div>
    <div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><span className="pl-2 text-[11px] font-medium text-[var(--ui-text-muted)]">{t("planning.direction")}</span><nav aria-label={t("planning.direction")} className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["all","incoming","outgoing"] as const).map((filter)=><Link key={filter} href={href(1,props.creditPage,filter)} aria-current={props.filter===filter?"page":undefined} className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:bg-[var(--ui-surface)] hover:text-[var(--ui-text)] active:bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:text-[var(--ui-text)] aria-[current=page]:shadow-[var(--ui-shadow-panel)] sm:min-h-9">{filter==="incoming"?t("planning.income"):filter==="outgoing"?t("planning.expenses"):t("planning.filtersList.all")}</Link>)}</nav></div><Popover.Root><Popover.Trigger asChild><button type="button" aria-haspopup="menu" className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:bg-[var(--ui-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:min-h-11">{t("planning.secondaryFilters")}{secondaryActive?` · ${t(`planning.filtersList.${props.status}`)}`:""}<ChevronDown aria-hidden="true" className="ml-2 size-4 shrink-0"/></button></Popover.Trigger><Popover.Portal><Popover.Content role="menu" align="end" sideOffset={4} collisionPadding={8} className="z-[80] min-w-44 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]">{secondaryFilters.map((filter)=><Popover.Close asChild key={filter}><Link role="menuitem" href={secondaryHref(filter)} aria-current={filter===props.status?"page":undefined} className="flex min-h-11 items-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm text-[var(--ui-text-secondary)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] active:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--ui-text)] sm:min-h-9">{t(`planning.filtersList.${filter}`)}</Link></Popover.Close>)}</Popover.Content></Popover.Portal></Popover.Root></div></div>:null}
    {(props.items.length || props.project?.stream === "design")?<div className="space-y-5">{attention.length?<section className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-subtle)] px-4 py-3" aria-labelledby="expected-attention"><h2 id="expected-attention" className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]"><CircleAlert className="size-4 text-[var(--ui-danger-text)]" aria-hidden="true"/>{t("planning.attentionSummary",{count:attention.length})}</h2>{props.project ? <dl className="flex flex-wrap gap-x-4 gap-y-2 text-xs">{([
        ["planning.attentionOverdue", attention.filter(item => item.due_state === "overdue").length],
        ["planning.attentionMissingDate", attention.filter(item => !item.expected_payment_date && !item.due_date).length],
        ["planning.attentionPartial", attention.filter(item => item.payment_state === "partial").length],
      ] as const).filter(([, count]) => count > 0).map(([label, count]) => <div key={label}><dt className="inline text-[var(--ui-text-muted)]">{t(label)}</dt><dd className="ui-numeric ml-1 inline font-semibold">{count}</dd></div>)}</dl> : <dl className="flex flex-wrap gap-x-4 gap-y-2 text-xs"><div><dt className="inline text-[var(--ui-text-muted)]">{t("planning.attentionOverdue")}</dt><dd className="ui-numeric ml-1 inline font-semibold text-[var(--ui-danger-text)]">{attention.filter((item)=>item.due_state==="overdue").length}</dd></div><div><dt className="inline text-[var(--ui-text-muted)]">{t("planning.attentionMissingDate")}</dt><dd className="ui-numeric ml-1 inline font-semibold">{attention.filter((item)=>!item.expected_payment_date&&!item.due_date).length}</dd></div><div><dt className="inline text-[var(--ui-text-muted)]">{t("planning.attentionPartial")}</dt><dd className="ui-numeric ml-1 inline font-semibold">{attention.filter((item)=>item.payment_state==="partial").length}</dd></div></dl>}</section>:null}{props.project?.stream === "design" ? renderOrderGroups() : props.project?<div className="space-y-1.5 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)] p-2">{props.items.map(renderItem)}</div>:<>{orderedMonths.map((month)=>renderMonth(month,months.get(month)??[]))}{undated.length?renderMonth("",undated,t("planning.unscheduledGroup")):null}</>}</div>:<p className={`${props.project ? "py-2" : `${panel} p-5`} text-sm text-[var(--ui-text-muted)]`}>{t("planning.empty")}</p>}
    <nav className="flex justify-between text-sm" aria-label={t("movements.pages")}>{props.page>1?<Link className="underline" href={href(props.page-1)}>{t("movements.previous")}</Link>:<span/>}{props.page*50<props.total?<Link className="underline" href={href(props.page+1)}>{t("movements.next")}</Link>:null}</nav>
    {!props.project&&props.creditTotal>0?<section className={`${panel} space-y-3 p-5`} aria-label={t("planning.unapplied")}><h2 className="font-medium">{t("planning.unapplied")}</h2><p className="text-xs text-[var(--ui-text-muted)]">{t("planning.unappliedHelp")}</p>{props.credits.length?<ul className="space-y-3">{props.credits.map((payment)=><li key={payment.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{date(payment.financial_date)} · {paymentLabel(payment)} · {t(`movements.kinds.${payment.direction}`)}</span><span className="ui-numeric">{money(payment.unapplied_amount,payment.currency)}</span></li>)}</ul>:<p className="text-sm text-[var(--ui-text-muted)]">{t("planning.noPayments")}</p>}<nav className="flex justify-between text-sm" aria-label={t("planning.creditPages")}>{props.creditPage>1?<Link className="underline" href={href(props.page,props.creditPage-1)}>{t("movements.previous")}</Link>:<span/>}{props.creditPage*50<props.creditTotal?<Link className="underline" href={href(props.page,props.creditPage+1)}>{t("movements.next")}</Link>:null}</nav></section>:null}
    <Dialog isOpen={Boolean(historyItem)} onRequestClose={() => setHistoryItemId(null)} title={t("planning.history")} closeLabel={t("movements.close")} className="sm:max-w-[40rem]">
      {historyItem ? <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
        <h3 className="font-semibold">{titleFor(historyItem)}</h3>
        <p className="ui-numeric mt-1 text-sm text-[var(--ui-text-secondary)]">{t("planning.settlementProgress", { paid: money(historyItem.settled_amount, historyItem.currency), remaining: money(historyItem.remaining_amount, historyItem.currency) })}</p>
        {Number(historyItem.adjustment_amount ?? 0) > 0 ? <p className="ui-numeric mt-1 text-sm text-[var(--ui-text-secondary)]">{t("settlement.closedAmount")}: {money(historyItem.adjustment_amount, historyItem.currency)}</p> : null}
        <ol className="mt-4 divide-y divide-[var(--ui-border)]">{props.history.filter(entry => entry.expected_item_id === historyItem.id).map(entry => {
          const released = props.history.filter(release => release.released_allocation_id === entry.id).reduce((sum, release) => sum + release.amount, 0);
          const canRelease = entry.amount > 0 && entry.amount + released > 0 && !props.tripLinks.some(link => link.expected_item_id === historyItem.id && link.cash);
          return <li key={entry.id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><div><p className="font-medium">{entry.amount < 0 ? t(entry.cause_movement_id ? "planning.cashRelease" : "planning.manualRelease") : t("planning.matched")}</p><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{date(entry.movement.financial_date)}</p></div><strong className="ui-numeric">{money(entry.amount, historyItem.currency)}</strong></div>
            <AnimatedDisclosure title={t("projectWorkspace.settlementDetails")}>
              <div className="space-y-2 pb-2 text-xs text-[var(--ui-text-secondary)]">
                {entry.cash ? <p>{t(historyItem.direction === "incoming" ? "planning.actualReceived" : "planning.actualPaid")}: {money(String(entry.cash.amount).replace(/^-/, ""), entry.cash.currency)}</p> : null}
                {entry.cash ? <p>{t("settlement.nativeAllocated")}: {money(entry.payment_amount, entry.payment_currency)}</p> : null}
                {entry.cash && entry.cash.currency !== historyItem.currency ? <p>{t("movements.settlementRateCompact", { currency: entry.cash.currency, obligation: historyItem.currency ?? "", rate: formatFinanceDecimal(entry.settlement_rate, locale, { maximumFractionDigits: 10 }), source: t(entry.settlement_source === "nbu" ? "movements.nbuShort" : "movements.manualShort"), date: date(entry.settlement_effective_date) })}</p> : null}
                {entry.reason ? <p className="whitespace-pre-wrap">{entry.reason}</p> : null}
                <div className="flex flex-wrap items-center gap-3"><Link href={`/finance/movements?movement=${entry.movement_id}`} className="inline-flex min-h-11 items-center underline underline-offset-4">{t("profitability.source")}</Link>{canRelease ? <Button size="sm" variant="ghost" onClick={() => { setHistoryItemId(null); setReleasing(entry.id); }}>{t("planning.unmatch")}</Button> : null}</div>
              </div>
            </AnimatedDisclosure>
          </li>;
        })}</ol>
        {props.adjustments.some(entry => entry.expected_item_id === historyItem.id) ? <ol className="mt-2 divide-y divide-[var(--ui-border)] border-t border-[var(--ui-border)]">{props.adjustments.filter(entry => entry.expected_item_id === historyItem.id).map(entry => <li key={entry.id} className="space-y-2 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{t(entry.amount > 0 ? "settlement.closureEvent" : "settlement.closureReversed")}</p><strong className="ui-numeric">{money(entry.amount, entry.currency)}</strong></div>
          <p className="text-xs text-[var(--ui-text-secondary)]">{date(entry.financial_date)} · {t("settlement.noCash")}</p>
          <p className="text-xs text-[var(--ui-text-secondary)]">{entry.amount > 0 ? t(`settlement.reasons.${entry.reason}`) : entry.reason}{entry.explanation ? ` · ${entry.explanation}` : ""}</p>
          {entry.amount > 0 && !props.adjustments.some(reversal => reversal.reversed_adjustment_id === entry.id) ? <Button size="sm" variant="ghost" className="min-h-11" onClick={() => { setHistoryItemId(null); setReversingClosure(entry.id); }}>{t("settlement.reverseClosure")}</Button> : null}
        </li>)}</ol> : null}
      </div> : null}
    </Dialog>
    <Dialog isOpen={cashToMatch !== null} onRequestClose={() => { setCashToMatch(null); setCashOptions(null); }} title={t("projectWorkspace.choosePayment")} closeLabel={t("movements.close")}>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4 sm:p-5"><p className="text-sm text-[var(--ui-text-secondary)]">{t("projectWorkspace.matchCategoryHelp")}</p>
        {cashLoading ? <p role="status" className="text-sm">{t("projectWorkspace.loadingPayments")}</p> : cashError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("projectWorkspace.matchLoadError")}</p> : !cashOptions?.items.length ? <p className="text-sm">{t("projectWorkspace.noCompatiblePayments")}</p> : null}
        {cashCandidate ? <p className="text-sm font-medium">{paymentLabel(cashCandidate)} · {money(cashCandidate.unapplied_amount, cashCandidate.currency)}</p> : null}
        {(cashOptions?.items ?? []).map(item => <Button key={item.id} variant="outline" className="h-auto min-h-11 w-full justify-between gap-2 whitespace-normal text-left" onClick={() => { setPaymentId(cashToMatch ?? ""); setCashToMatch(null); setMatching(item); }}><span>{item.order_name ? `${item.order_name} · ` : ""}{titleFor(item)}</span><span className="ui-numeric">{money(item.remaining_amount, item.currency)}</span></Button>)}
        <p className="text-xs text-[var(--ui-text-muted)]">{t("projectWorkspace.matchCategoryHint")}</p>
      </div>
    </Dialog>
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
    <Dialog isOpen={editing!==null} className={props.project?.stream==="expenses"?"sm:max-w-[36rem]":undefined} closeDisabled={pending} onRequestClose={()=>setEditing(null)} title={t(editing==="new"&&props.project?.stream==="expenses"?"project.addExpense":editing==="new"?"planning.create":"planning.edit")} closeLabel={t("movements.close")}>
      {editing?<div className={`min-h-0 overflow-y-auto overscroll-contain p-4 ${props.project?.stream==="expenses"?"sm:p-5":"sm:p-6"}`}><ExpectedForm obligation={editing!=="new"?props.obligations.find((entry)=>entry.expected_item_id===editing?.id)?.component:undefined} data={props} project={props.project} item={editing==="new"?undefined:editing} onSaved={()=>{const created=editing==="new";setEditing(null);if(created&&props.itemId&&!props.project)router.push("/finance/expected");}} onPending={setPending}/></div>:null}
    </Dialog>
    <Dialog isOpen={recording!==null} className="sm:max-w-[42rem]" closeDisabled={pending} onRequestClose={()=>setRecording(null)} title={t(props.project?.stream==="expenses"?"project.recordExpense":"planning.recordPayment")} closeLabel={t("movements.close")}>
      {recording?<div className="min-h-0 overflow-y-auto p-4 sm:p-5">{props.project && recording.direction === "incoming" && props.categories.find(category => category.id === recording.category_id)?.nature === "operating" ? <ProjectSettlementForm data={props} projectId={props.project.projectId} today={today} expected={recording} onSaved={() => { setRecording(null); router.refresh(); }} onPending={setPending}/> : <EntryForm data={props} today={today} transfer={false} expected={recording} onSaved={()=>{setRecording(null);router.refresh();}} onPending={setPending}/>}</div>:null}
    </Dialog>
    <Dialog isOpen={closingRemainder !== null} closeDisabled={pending} onRequestClose={() => setClosingRemainderId(null)} title={t("settlement.closeRemainder")} closeLabel={t("movements.close")}>
      {closingRemainder ? <div className="min-h-0 overflow-y-auto p-4 sm:p-5"><RemainderClosureForm key={`${closingRemainder.id}:${closingRemainder.version}:${closingRemainder.remaining_amount}:${closingRemainder.settled_amount}:${closingRemainder.adjustment_amount}`} item={closingRemainder} data={props} today={today} onSaved={() => { setClosingRemainderId(null); router.refresh(); }} onPending={setPending}/></div> : null}
    </Dialog>
    <Dialog isOpen={reversingClosure !== null} closeDisabled={pending} onRequestClose={() => setReversingClosure(null)} title={t("settlement.reverseClosure")} closeLabel={t("movements.close")}>
      {reversingClosure ? <div className="p-4 sm:p-5"><FinanceActionForm action={saveRemainderAdjustment} label={t("settlement.reverseClosure")} onSaved={() => { setReversingClosure(null); router.refresh(); }} onPending={setPending}>
        <input type="hidden" name="intent" value="reverseClosure"/><input type="hidden" name="adjustmentId" value={reversingClosure}/><input type="hidden" name="date" value={today}/>
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("settlement.reverseHelp")}</p><FormField label={t("settlement.reason")}><Textarea name="reason" maxLength={2000} required/></FormField>
        <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" name="confirmed" required className="mt-1 size-4"/>{t("settlement.confirmReverse")}</label>
      </FinanceActionForm></div> : null}
    </Dialog>
    <Dialog isOpen={matching!==null} closeDisabled={pending} onRequestClose={()=>{setMatching(null);setCashOptions(null);}} title={t("planning.match")} closeLabel={t("movements.close")}>
      {matching?<div className="p-5"><FinanceActionForm action={saveFinancePlanning} label={t("planning.match")} onSaved={()=>{setMatching(null);setCashOptions(null);}} onPending={setPending}>
        <input type="hidden" name="intent" value="allocate"/><input type="hidden" name="itemId" value={matching.id??""}/>
        <p className="text-sm">{matching.order_name ? `${matching.order_name} · ` : ""}{matching.description||categoryLabel(matching.category_id)} · {t("planning.remaining")}: {money(matching.remaining_amount,matching.currency)}</p>
        <FormField label={t("planning.payment")}><Select name="movementId" aria-label={t("planning.payment")} value={paymentId} onValueChange={setPaymentId} required searchPlaceholder={t("planning.searchPayments")} searchEmptyMessage={t("planning.noPayments")}>{candidates.map((payment)=><SelectItem key={payment.id} value={payment.id??""}>{date(payment.financial_date)} · {paymentLabel(payment)} · {money(payment.unapplied_amount,payment.currency)}</SelectItem>)}</Select></FormField>
        <FormField label={t("planning.allocateAmount")}><Input name="amount" inputMode="decimal" defaultValue={matching.remaining_amount??""} required/></FormField>
        <p className="text-xs text-[var(--ui-text-muted)]">{t("planning.matchHelp")}</p>{props.project ? <p className="text-xs text-[var(--ui-text-muted)]">{t("projectWorkspace.studioCashHelp")}</p> : null}
      </FinanceActionForm></div>:null}
    </Dialog>
    <Dialog isOpen={releasing!==null} closeDisabled={pending} onRequestClose={()=>setReleasing(null)} title={t("planning.unmatch")} closeLabel={t("movements.close")}>
      {releasing?<div className="p-5"><FinanceActionForm action={saveFinancePlanning} label={t("planning.unmatch")} onSaved={()=>setReleasing(null)} onPending={setPending}><input type="hidden" name="intent" value="release"/><input type="hidden" name="allocationId" value={releasing}/><p className="text-sm">{t("planning.unmatchHelp")}</p><FormField label={t("movements.reason")}><Textarea name="reason" maxLength={2000} required/></FormField></FinanceActionForm></div>:null}
    </Dialog>
  </div>;
}
