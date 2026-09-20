"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale,useTranslations } from "next-intl";
import { saveFinancePlanning } from "@/app/(app)/finance/expected/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField,Input,Textarea } from "@/components/ui/form-field";
import { Select,SelectItem } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCategorySelect } from "./category-select";
import { FinanceCurrencySelect } from "./currency-select";
import type { FinanceExpected } from "@/lib/finance-planning";
import { financeCategoryLabel,financeMovementCategoryLabel } from "@/lib/finance-planning";
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
  const [category,setCategory]=useState(item?.category_id??defaultCategory?.id??"");
  const [commitment,setCommitment]=useState(item?.commitment??(project?.stream==="contractor_bonus"?"tentative":"agreed"));
  const [source,setSource]=useState("manual"),[visit,setVisit]=useState(""),[contractor,setContractor]=useState(""),[extraVisit,setExtraVisit]=useState(false);
  const [estimated,setEstimated]=useState(item?.certainty==="estimated");
  const [established,setEstablished]=useState(item?.is_established??false);
  const [establishedTouched,setEstablishedTouched]=useState(Boolean(item));
  const [expectedTouched,setExpectedTouched]=useState(Boolean(item));
  const [due,setDue]=useState(item?.due_date??""),[expected,setExpected]=useState(item?.expected_payment_date??"");
  const fixedPayroll=Boolean(obligation && ["payout","deductions","bonus"].includes(obligation));
  const canEstablish=commitment==="agreed"&&!estimated;
  const effectiveEstablished=canEstablish&&(establishedTouched?established:Boolean(due)&&(!project||due<=project.today));
  return <FinanceActionForm action={saveFinancePlanning} label={t("planning.save")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value="expected"/><input type="hidden" name="id" value={item?.id??""}/><input type="hidden" name="version" value={item?.version??0}/>
    {project?<><input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="stream" value={project.stream}/>
      {item?<p className="text-xs text-[var(--ui-text-muted)]">{t("project.editHelp")}</p>:<>
        {project.stream==="supervision"?<><FormField label={t("project.chargeSource")}><Select name="source" aria-label={t("project.chargeSource")} value={source} onValueChange={setSource}><SelectItem value="manual">{t("project.manualCharge")}</SelectItem><SelectItem value="visit">{t("project.visitCharge")}</SelectItem></Select></FormField>
          {source==="visit"?<><FormField label={t("project.visit")}><Select name="visitId" aria-label={t("project.visit")} value={visit} onValueChange={setVisit} required searchPlaceholder={t("project.searchVisits")}>{project.visits.map((v)=><SelectItem key={v.id} value={v.id}>{v.title} · {formatDateOnly(v.starts_at.slice(0,10),locale)}</SelectItem>)}</Select></FormField><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={extraVisit} onChange={(e)=>setExtraVisit(e.target.checked)}/>{t("project.extraVisit")}</label><input type="hidden" name="extraVisit" value={String(extraVisit)}/></>:null}</>:null}
        {project.stream==="contractor_bonus"?<FormField label={t("project.contractor")}><Select name="contractorId" aria-label={t("project.contractor")} value={contractor} onValueChange={setContractor} searchPlaceholder={t("project.searchContractors")}><SelectItem value="">{t("project.noContractor")}</SelectItem>{project.contractors.map((c)=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</Select></FormField>:null}
      </>}</>:null}
    {obligation?<p className="text-xs text-[var(--ui-text-muted)]">{t("schedules.sourceHelp")}</p>:null}
    <div className="grid gap-4 sm:grid-cols-2">
      {project||obligation?<input type="hidden" name="direction" value={item?.direction??"incoming"}/>:<FormField label={t("movements.type")}><Select name="direction" aria-label={t("movements.type")} value={direction} onValueChange={(value)=>{setDirection(value);setCategory("");}}>{["incoming","outgoing"].map((value)=><SelectItem key={value} value={value}>{t(`movements.kinds.${value}`)}</SelectItem>)}</Select></FormField>}
      <FormField label={t("movements.amount")}><Input name="amount" readOnly={fixedPayroll} defaultValue={item?.amount??(project?.stream==="supervision"&&terms?.mode==="per_visit"?terms.amount??"":"")} inputMode="decimal" required/></FormField>
      {obligation?<input type="hidden" name="currency" value={currency}/>:<FormField label={t("currency")}><FinanceCurrencySelect name="currency" currencies={data.currencies} reportingCurrency={data.settings?.base_currency??""} value={currency} onValueChange={setCurrency}/></FormField>}
      {obligation?<input type="hidden" name="categoryId" value={category}/>:<FinanceCategorySelect categories={data.categories} direction={direction} owner={data.categories.find((c)=>c.id===item?.category_id)?.nature==="owner_distribution"} value={category} onValueChange={setCategory} currentId={item?.category_id}/>}
      {obligation?<input type="hidden" name="dueDate" value={due}/>:<FormField label={t("planning.dueDate")}><DatePicker name="dueDate" aria-label={t("planning.dueDate")} value={due} onValueChange={(value)=>{setDue(value);if(!expectedTouched)setExpected(value);}} locale={locale}/></FormField>}
      <FormField label={t("planning.expectedDate")}><DatePicker name="expectedDate" aria-label={t("planning.expectedDate")} value={expected} onValueChange={(value)=>{setExpected(value);setExpectedTouched(true);}} locale={locale}/></FormField>
      <FormField label={t("planning.agreementState")}><Select name="commitment" aria-label={t("planning.agreementState")} value={commitment} onValueChange={setCommitment}>{["agreed","tentative","cancelled"].map((value)=><SelectItem key={value} value={value}>{t(`planning.agreementOptions.${value}`)}</SelectItem>)}</Select></FormField>
      <label className="flex min-h-11 items-center gap-3 self-end text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" disabled={fixedPayroll} checked={estimated} onChange={(event)=>setEstimated(event.target.checked)} className="size-4"/>{t("planning.estimatedAmount")}</label>
    </div>
    <input type="hidden" name="certainty" value={estimated?"estimated":"fixed"}/><input type="hidden" name="established" value={String(effectiveEstablished)}/>
    {canEstablish?<details className="text-sm text-[var(--ui-text-secondary)]"><summary className="cursor-pointer py-1">{t("planning.moreOptions")}</summary><div className="mt-2 space-y-1.5 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3"><label className="flex items-start gap-2"><input type="checkbox" checked={effectiveEstablished} onChange={(event)=>{setEstablishedTouched(true);setEstablished(event.target.checked);}} className="mt-1 size-4"/>{t(direction==="incoming"?"planning.trackReceivable":"planning.trackObligation")}</label><p className="text-xs text-[var(--ui-text-muted)]">{t("planning.establishedAdvancedHelp")}</p></div></details>:null}
    <FormField label={t("movements.description")}><Textarea name="description" defaultValue={item?.description??""} rows={2} maxLength={2000}/></FormField>
  </FinanceActionForm>;
}

export function FinanceExpectedWorkspace(props:Foundation&FinancePlanningData&{ page:number;creditPage:number;filter:string;period?:FinancePlanningPeriod;today?:string;project?:ProjectContext }) {
  const t=useTranslations("Finance"),locale=useLocale();
  const [editing,setEditing]=useState<FinanceExpected|"new"|null>(null);
  const [matching,setMatching]=useState<FinanceExpected|null>(null);
  const [paymentId,setPaymentId]=useState("");
  const [releasing,setReleasing]=useState<string|null>(null);
  const [pending,setPending]=useState(false);
  const money=(amount:number|null,code:string|null)=>{const currency=props.currencies.find((item)=>item.code===code);return currency?formatFinanceAmount(amount??0,currency,locale):`${amount??0} ${code??""}`;};
  const categoryLabel=(id:string|null)=>financeCategoryLabel(props.categories.find((item)=>item.id===id),"",(key)=>t(`planning.defaults.${key}`));
  const paymentLabel=(payment:FinancePlanningData["payments"][number])=>payment.description||financeMovementCategoryLabel(payment.category_id,payment.category,props.categories,(key)=>t(`planning.defaults.${key}`));
  const date=(value:string|null)=>value?formatDateOnly(value,locale):"—";
  const period=props.period??"all",today=props.project?.today??props.today??new Date().toISOString().slice(0,10),currentMonth=today.slice(0,7);
  const href=(page=props.page,credits=props.creditPage,filter=props.filter,nextPeriod=period)=>props.project?`/projects/${props.project.projectId}?view=finance&stream=${props.project.stream}&page=${page}&credits=${credits}&filter=${filter}`:`/finance/expected?page=${page}&credits=${credits}&filter=${filter}&period=${nextPeriod}`;
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
  const attention:FinanceExpected[]=[],current:FinanceExpected[]=[],settledCurrent:FinanceExpected[]=[],earlier:FinanceExpected[]=[],future=new Map<string,FinanceExpected[]>();
  for(const item of props.items){
    const itemPeriod=cashPeriodFor(item);
    if(needsAttention(item)) attention.push(item);
    else if(itemPeriod===currentMonth&&item.commitment!=="cancelled"&&item.payment_state==="settled") settledCurrent.push(item);
    else if(itemPeriod===currentMonth) current.push(item);
    else if(itemPeriod>currentMonth) future.set(itemPeriod,[...(future.get(itemPeriod)??[]),item]);
    else earlier.push(item);
  }
  const titleFor=(item:FinanceExpected)=>{
    const obligation=obligationFor(item),link=linkFor(item);
    const localized=obligation?.obligation.kind==="payroll"?item.description?.replace(/^Base salary(?= ·|$)/,t("schedules.defaultSalaryName")):item.description;
    const component=obligation&&["deductions","employer_cost"].includes(obligation.component)?localized?.replace(/ · (?:deductions|employer cost)(?= ·|$)/,` · ${t(`schedules.components.${obligation.component}`)}`):localized;
    const base=link?.source==="monthly"&&item.description===`Supervision · ${link.period_start?.slice(0,7)}`?t("project.streams.supervision"):(obligation||link?.source==="monthly"?component?.replace(/ · \d{4}-\d{2}$/,""):component)||categoryLabel(item.category_id);
    return obligation?.obligation.kind==="payroll"&&obligation.obligation.employee_name&&!base.includes(obligation.obligation.employee_name)?`${base} · ${obligation.obligation.employee_name}`:base;
  };
  const renderItem=(item:FinanceExpected)=>{
    const obligation=obligationFor(item),link=linkFor(item),history=props.history.filter((entry)=>entry.expected_item_id===item.id);
    const active=item.commitment!=="cancelled"&&(item.remaining_amount??0)>0,contextPeriod=contextPeriodFor(item);
    const context=contextPeriod?(obligation?.obligation.kind==="payroll"?t("planning.forPeriod",{period:monthLabel(contextPeriod)}):monthLabel(contextPeriod)):link?.context_label??null;
    const timing=item.due_date&&item.expected_payment_date&&item.due_date!==item.expected_payment_date
      ?t("planning.timingDifferent",{due:shortDate(item.due_date),expected:shortDate(item.expected_payment_date)})
      :item.due_date?t("planning.timingDue",{date:shortDate(item.due_date)})
      :item.expected_payment_date?t("planning.timingExpected",{date:shortDate(item.expected_payment_date)}):t("planning.timingMissing");
    const stateClass=item.commitment==="cancelled"?"bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]":active&&item.due_state==="overdue"?"bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]":"bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]";
    return <article key={item.id} id={`expected-${item.id}`} className="space-y-2.5 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-[var(--ui-text)]">{titleFor(item)}</h3><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{context?`${context} · `:""}{timing}{link?.context_label?` · ${link.context_label}`:""}</p></div><strong className="ui-numeric shrink-0 text-sm">{money(item.amount,item.currency)}</strong></div>
      <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2 py-1 font-medium ${stateClass}`}>{t(`planning.states.${item.payment_state}`)}</span>{active&&["overdue","due","unscheduled"].includes(item.due_state??"")?<span className={item.due_state==="overdue"?"font-semibold text-[var(--ui-danger-text)]":"font-medium text-[var(--ui-text-secondary)]"}>{t(`planning.states.${item.due_state}`)}</span>:null}{item.commitment!=="agreed"?<span className="font-medium text-[var(--ui-text-secondary)]">{t(`planning.agreementOptions.${item.commitment}`)}</span>:null}{item.certainty==="estimated"?<span className="font-medium text-[var(--ui-text-secondary)]">{t("planning.estimatedAmount")}</span>:null}</div>
      {item.payment_state==="partial"?<p className="ui-numeric text-sm font-medium">{t("planning.settlementProgress",{paid:money(item.settled_amount,item.currency),remaining:money(item.remaining_amount,item.currency)})}</p>:null}
      <div className="flex flex-wrap items-center justify-between gap-2"><details className="group text-sm"><summary className="flex min-h-11 cursor-pointer list-none items-center text-[var(--ui-text-secondary)] underline decoration-[var(--ui-border-strong)] underline-offset-2 marker:content-none sm:min-h-8">{t("planning.details")}</summary><div className="mt-2 space-y-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3">
        <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2"><div><dt className="text-[var(--ui-text-muted)]">{t("movements.type")}</dt><dd>{t(`movements.kinds.${item.direction}`)} · {categoryLabel(item.category_id)}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("planning.agreementState")}</dt><dd>{t(`planning.agreementOptions.${item.commitment}`)} · {t(`planning.states.${item.certainty}`)}</dd></div>{obligation?<div><dt className="text-[var(--ui-text-muted)]">{t("schedules.period")}</dt><dd>{date(obligation.obligation.period_start)} – {date(obligation.obligation.period_end)}</dd></div>:null}<div><dt className="text-[var(--ui-text-muted)]">{t("planning.dueDate")} / {t("planning.expectedDate")}</dt><dd>{date(item.due_date)} / {date(item.expected_payment_date)}</dd></div></dl>
        <div className="flex flex-wrap items-center gap-2">{link&&!props.project?<Link className="px-3 py-2 text-sm underline" href={`/projects/${link.project_id}?view=finance&stream=${link.stream}`}>{t("project.open")}</Link>:<Button size="sm" variant="ghost" onClick={()=>setEditing(item)}>{t("edit")}</Button>}{active?<Button size="sm" variant="ghost" onClick={()=>{setPaymentId("");setMatching(item);}}>{t("planning.match")}</Button>:null}</div>
        {history.length?<div><p className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("planning.history")}</p><ul className="mt-2 space-y-2 text-xs">{history.map((entry)=>{const remaining=entry.amount+history.filter((release)=>release.released_allocation_id===entry.id).reduce((sum,release)=>sum+release.amount,0);return <li key={entry.id} className="break-words"><span>{date(entry.movement.financial_date)} · {money(entry.amount,item.currency)} · {entry.amount<0?t(entry.cause_movement_id?"planning.cashRelease":"planning.manualRelease"):t("planning.matched")}</span>{entry.amount>0&&remaining>0?<Button size="sm" variant="ghost" onClick={()=>setReleasing(entry.id)}>{t("planning.unmatch")}</Button>:null}</li>;})}</ul></div>:null}
      </div></details>{active?<Button asChild size="sm" className="min-h-11 sm:min-h-8"><Link href={`/finance/movements?expected=${item.id}`}>{t("planning.recordPayment")}</Link></Button>:null}</div>
    </article>;
  };
  const itemSection=(key:"attention"|"current"|"earlier",items:FinanceExpected[])=>items.length?<section className="space-y-2" aria-labelledby={`expected-${key}`}><h2 id={`expected-${key}`} className="text-sm font-semibold text-[var(--ui-text-secondary)]">{t(`planning.sections.${key}`)} <span className="ml-1 font-normal text-[var(--ui-text-muted)]">{items.length}</span></h2><div className={`${panel} divide-y divide-[var(--ui-border)]`}>{items.map(renderItem)}</div></section>:null;
  return <div className="mx-auto w-full max-w-4xl space-y-6">
    {props.project?<h2 className="text-lg font-semibold">{t(`project.streams.${props.project.stream}`)}</h2>:<PageHeader className="flex-col items-stretch sm:flex-row sm:items-center" title={t("planning.title")} action={props.settings?.finalized_at?<Button className="w-full sm:w-auto" onClick={()=>setEditing("new")}>{t("planning.create")}</Button>:undefined}/>}
    {!props.settings?.finalized_at?<p className={`${panel} p-5 text-sm`}>{t("movements.setupRequired")} <Link href="/finance" className="underline">{t("movements.setupLink")}</Link></p>:props.project?<Button onClick={()=>setEditing("new")}>{t("planning.create")}</Button>:null}
    {!props.project?<nav aria-label={t("planning.periodFilters.label")} className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["month","30days","3months","6months","all"] as const).map((value)=><Link key={value} href={href(1,props.creditPage,props.filter,value)} aria-current={period===value?"page":undefined} className="flex min-h-11 items-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:text-[var(--ui-text)] aria-[current=page]:shadow-[var(--ui-shadow-panel)] sm:min-h-9">{t(`planning.periodFilters.${value}`)}</Link>)}</nav>:null}
    <nav aria-label={t("planning.filters")} className="flex flex-wrap gap-x-4 gap-y-2 text-sm">{(props.project?["all","receivables","cancelled"]:["all","incoming","outgoing","receivables","obligations","cancelled"]).map((filter)=><Link key={filter} href={href(1,props.creditPage,filter)} aria-current={props.filter===filter?"page":undefined} className="flex min-h-11 items-center text-[var(--ui-text-secondary)] underline-offset-4 aria-[current=page]:font-semibold aria-[current=page]:underline sm:min-h-8">{t(`planning.filtersList.${filter}`)}</Link>)}</nav>
    {props.items.length?<div className="space-y-5">{itemSection("attention",attention)}{itemSection("current",current)}{settledCurrent.length?<details className={panel} data-settled-current><summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-2 text-sm font-medium text-[var(--ui-text-secondary)] marker:content-none">{t("planning.sections.completedCurrent")} <span className="ml-1 text-[var(--ui-text-muted)]">· {settledCurrent.length}</span></summary><div className="divide-y divide-[var(--ui-border)] border-t border-[var(--ui-border)]">{settledCurrent.map(renderItem)}</div></details>:null}{future.size?<section className="space-y-2" aria-labelledby="expected-future"><h2 id="expected-future" className="text-sm font-semibold text-[var(--ui-text-secondary)]">{t("planning.sections.future")} <span className="ml-1 font-normal text-[var(--ui-text-muted)]">{Array.from(future.values()).reduce((sum,items)=>sum+items.length,0)}</span></h2><div className="space-y-2">{Array.from(future).sort(([a],[b])=>a.localeCompare(b)).map(([month,items])=>{const totals=Array.from(items.reduce((result,item)=>result.set(item.currency,(result.get(item.currency)??0)+(item.amount??0)),new Map<string|null,number>()));return <details key={month} className={panel} data-future-month={month}><summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm font-semibold marker:content-none"><span>{t("planning.futureGroup",{month:monthLabel(month),count:items.length})}</span><span className="ui-numeric text-xs font-medium text-[var(--ui-text-muted)]">{totals.map(([currency,total])=>money(total,currency)).join(" · ")}</span></summary><div className="divide-y divide-[var(--ui-border)] border-t border-[var(--ui-border)]">{items.map(renderItem)}</div></details>;})}</div></section>:null}{itemSection("earlier",earlier)}</div>:<p className={`${panel} p-5 text-sm text-[var(--ui-text-muted)]`}>{t("planning.empty")}</p>}
    <nav className="flex justify-between text-sm" aria-label={t("movements.pages")}>{props.page>1?<Link className="underline" href={href(props.page-1)}>{t("movements.previous")}</Link>:<span/>}{props.page*50<props.total?<Link className="underline" href={href(props.page+1)}>{t("movements.next")}</Link>:null}</nav>
    {props.creditTotal>0?<section className={`${panel} space-y-3 p-5`} aria-label={t("planning.unapplied")}><h2 className="font-medium">{t("planning.unapplied")}</h2><p className="text-xs text-[var(--ui-text-muted)]">{t("planning.unappliedHelp")}</p>{props.credits.length?<ul className="space-y-3">{props.credits.map((payment)=><li key={payment.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{date(payment.financial_date)} · {paymentLabel(payment)} · {t(`movements.kinds.${payment.direction}`)}</span><span className="ui-numeric">{money(payment.unapplied_amount,payment.currency)}</span></li>)}</ul>:<p className="text-sm text-[var(--ui-text-muted)]">{t("planning.noPayments")}</p>}<nav className="flex justify-between text-sm" aria-label={t("planning.creditPages")}>{props.creditPage>1?<Link className="underline" href={href(props.page,props.creditPage-1)}>{t("movements.previous")}</Link>:<span/>}{props.creditPage*50<props.creditTotal?<Link className="underline" href={href(props.page,props.creditPage+1)}>{t("movements.next")}</Link>:null}</nav></section>:null}
    <Dialog isOpen={editing!==null} closeDisabled={pending} onRequestClose={()=>setEditing(null)} title={t(editing==="new"?"planning.create":"planning.edit")} closeLabel={t("movements.close")}>
      {editing?<div className="p-5"><ExpectedForm obligation={editing!=="new"?props.obligations.find((entry)=>entry.expected_item_id===editing?.id)?.component:undefined} data={props} project={props.project} item={editing==="new"?undefined:editing} onSaved={()=>setEditing(null)} onPending={setPending}/></div>:null}
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
