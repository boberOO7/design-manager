"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Plus, ArrowLeft, MapPin, CalendarDays, CalendarCheck2, FolderKanban, UsersRound, ArrowUpRight } from "lucide-react";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { saveFinanceTrip } from "@/app/(app)/finance/trips/actions";
import type { getFinanceData } from "@/data/queries/finance";
import type { FinanceTripData, FinanceTripOptions, getFinanceTrips } from "@/data/queries/finance-trips";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { formatFinanceAmount } from "@/lib/finance";
import { formatDateOnly } from "@/lib/utils";
import { deriveTripStatus, sumTripMoney } from "@/lib/finance-trips";
import { FinanceActionForm } from "./finance-action-form";

import { TripExpenseSheet } from "./trip-expense-sheet";
import { TripEntryEditor } from "./trip-entry-editor";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";
const quiet = "text-sm text-[var(--ui-text-muted)]";
const link = "inline-flex min-h-11 items-center rounded px-2 text-sm font-medium hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";

function TripForm({ options, detail, projectId, today, onSaved, onPending }: { options: FinanceTripOptions; detail?: FinanceTripData; projectId?: string; today: string; onSaved: (id?: string) => void; onPending: (v: boolean) => void }) {
  const t = useTranslations("Finance.trips"), f = useTranslations("Finance");
  const locale = useLocale();
  const trip = detail?.trip;
  const [start, setStart] = useState(trip?.starts_on ?? today), [end, setEnd] = useState(trip?.ends_on ?? today);
  const [project, setProject] = useState(trip?.project_id ?? projectId ?? "none");
  return <FinanceActionForm className="space-y-4 p-4 sm:p-6" action={saveFinanceTrip} onSaved={s => onSaved(s.id)} onPending={onPending} label={f("planning.save")}>
    <input type="hidden" name="intent" value="trip"/><input type="hidden" name="id" value={trip?.id ?? ""}/><input type="hidden" name="version" value={trip?.version ?? 0}/>
    <input type="hidden" name="status" value={deriveTripStatus(start,end,today)}/>
    <FormField label={t("name")}><Input name="title" defaultValue={trip?.title ?? ""} maxLength={160} required data-dialog-initial-focus/></FormField>
    <FormField label={t("destination")}><Input name="destination" defaultValue={trip?.destination ?? ""} maxLength={160} required/></FormField>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("start")}><DatePicker aria-label={t("start")} locale={locale} name="startsOn" value={start} onValueChange={v => { setStart(v); if (end < v) setEnd(v); }} required/></FormField><FormField label={t("end")}><DatePicker aria-label={t("end")} locale={locale} name="endsOn" value={end} min={start} onValueChange={setEnd} required/></FormField></div>
    <FormField label={t("project")}><input type="hidden" name="projectId" value={project === "none" ? "" : project}/><Select aria-label={t("project")} value={project} onValueChange={setProject} disabled={Boolean(detail?.entries.length)}><SelectItem value="none">{t("noProject")}</SelectItem>{options.projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</Select></FormField>
    {detail?.entries.length ? <p className={quiet}>{t("projectHistory")}</p> : null}
    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">{t("travelers")}</legend><div className="grid gap-2 sm:grid-cols-2">{options.members.filter(m => m.is_active && m.profile.is_active || detail?.travelers.some(v => v.employee_id === m.user_id)).map(m => <label key={m.user_id} className="flex min-h-11 items-center gap-2 rounded border border-[var(--ui-border)] px-3 text-sm"><input type="checkbox" name="travelers" value={m.user_id} defaultChecked={detail?.travelers.some(v => v.employee_id === m.user_id && v.active)}/>{m.profile.full_name}</label>)}</div></fieldset>
    <FormField label={t("note")}><Textarea name="note" defaultValue={trip?.note ?? ""} rows={2} maxLength={2000}/></FormField>
  </FinanceActionForm>;
}

export function FinanceTripsWorkspace({ foundation, options, trips, today, projectId }: { foundation: Foundation; options: FinanceTripOptions; trips: NonNullable<Awaited<ReturnType<typeof getFinanceTrips>>>; today: string; projectId?: string }) {
  const t = useTranslations("Finance.trips"), f = useTranslations("Finance"), locale = useLocale(), router = useRouter();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const base = foundation.currencies.find(v => v.code === foundation.settings?.base_currency);
  return <div className="space-y-6"><PageHeader className="flex-col items-start sm:flex-row sm:items-center" title={t("title")} description={t("description")} action={foundation.settings?.finalized_at ? <Button onClick={() => setOpen(true)}><Plus className="mr-2 size-4"/>{t("addTrip")}</Button> : undefined}/>
    {!base || !foundation.settings?.finalized_at ? <Link className={link} href="/finance/accounts">{t("setup")}</Link> : trips.length ? <div className={`${panel} divide-y divide-[var(--ui-border)]`}>{trips.map(trip => <Link key={trip.id} href={`/finance/trips/${trip.id}`} className="flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">{trip.title}</h2><p className={`mt-1 ${quiet}`}>{trip.destination} · {formatDateOnly(trip.starts_on ?? "", locale)} – {formatDateOnly(trip.ends_on ?? "", locale)}</p>{trip.project_id ? <p className={quiet}>{options.projects.find(p => p.id === trip.project_id)?.name}</p> : null}</div><div className="flex flex-wrap items-center gap-4 text-sm"><span className={quiet}>{t(`statuses.${deriveTripStatus(trip.starts_on ?? today,trip.ends_on ?? today,today,trip.calendar_state)}`)}</span><dl className="grid w-full gap-2 tabular-nums sm:w-auto sm:grid-cols-3 sm:gap-6">{[[t("plan"),trip.planned_amount],[t("actual"),trip.actual_amount],[t("variance"),trip.variance]].map(([label,value])=><div key={label} className="flex items-baseline justify-between gap-3 sm:block"><dt className={quiet}>{label}</dt><dd className="whitespace-nowrap font-medium sm:mt-1">{value===null ? "—" : `${label===t("plan") && trip.has_plan ? "≈ " : ""}${formatFinanceAmount(value ?? "0",base,locale)}`}</dd></div>)}</dl></div></Link>)}</div> : <div className={`${panel} p-8`}><p className="font-medium">{t("empty")}</p><p className={`mt-2 ${quiet}`}>{t("emptyHelp")}</p></div>}
    <Dialog isOpen={open} onRequestClose={() => { if (!pending) setOpen(false); }} closeDisabled={pending} closeLabel={f("close")} title={t("addTrip")} className="sm:max-w-xl">{open ? <TripForm options={options} today={today} projectId={projectId} onPending={setPending} onSaved={id => { setOpen(false); router.push(`/finance/trips/${id}`); router.refresh(); }}/> : null}</Dialog>
  </div>;
}

export function FinanceTripWorkspace({ data, foundation, options, today }: { data: FinanceTripData; foundation: Foundation; options: FinanceTripOptions; today: string }) {
  const t=useTranslations("Finance.trips"),f=useTranslations("Finance"),locale=useLocale(),router=useRouter();
  const [editor,setEditor]=useState<"trip"|"advance"|null>(null),[pending,setPending]=useState(false);
  const base=foundation.currencies.find(v=>v.code===data.trip.reporting_currency);
  if(!base)return null;
  const money=(amount:string|null,currency=base.code)=>{const unit=foundation.currencies.find(v=>v.code===currency);return unit?formatFinanceAmount(amount ?? "0",unit,locale):`${amount} ${currency}`;};
  const sum=(entries:FinanceTripData["entries"])=>sumTripMoney(entries.map(e=>e.net_reporting_amount ?? "0"),base.minor_units);
  const due=data.balances.filter(v=>v.expected?.commitment!=="cancelled" && Number(v.expected?.remaining_amount)>0);
  const unusedAdvances=["planned","active"].includes(data.trip.status ?? "")?data.travelers.flatMap(person=>[...new Set(data.entries.filter(e=>e.employee_id===person.employee_id && e.kind!=="plan").map(e=>e.currency))].flatMap(currency=>{
    const digits=foundation.currencies.find(v=>v.code===currency)?.minor_units;if(digits===undefined || !currency)return [];
    const entries=data.entries.filter(e=>e.employee_id===person.employee_id && e.currency===currency && e.kind!=="plan");
    const settlements=data.balances.filter(b=>b.employee_id===person.employee_id && b.currency===currency);
    const balance=sumTripMoney([...entries.map(e=>e.kind==="advance"?`-${e.net_amount}`:e.net_amount),...settlements.map(b=>`${b.direction==="outgoing"?"-":""}${b.expected?.settled_amount ?? "0"}`)],digits);
    return Number(balance)<0?[{employee:person.employee_name,currency,amount:balance.slice(1)}]:[];
  })):[];
  const saved=()=>{setEditor(null);router.refresh();};
  const warning=data.trip.calendar_source_id && (data.trip.calendar_state!=="active" || data.calendar && data.calendar.project_id!==data.trip.project_id);
  const hasActual=data.entries.some(e=>e.kind==="expense" && !e.reverses_id && !data.entries.some(r=>r.reverses_id===e.id) && Number(e.net_amount)!==0);
  const participants=data.travelers.filter(v=>v.active).map(v=>v.employee_name).join(", ");
  const tripName=(data.trip.title ?? "").replace(/^(Business trip|Відрядження)\s*·\s*/,"");
  const status=deriveTripStatus(data.trip.starts_on ?? today,data.trip.ends_on ?? today,today,data.trip.calendar_state);
  const meta="inline-flex min-h-9 items-center gap-1.5 rounded px-1.5 text-xs text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";
  return <div className="space-y-4">
    <Link className="inline-flex min-h-11 items-center gap-2 rounded text-sm text-[var(--ui-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" href="/finance/trips"><ArrowLeft className="size-4"/>{t("title")}</Link>
    <div className="flex items-start justify-between gap-3"><div><h1 className="text-xl font-semibold sm:text-2xl">{t("detailTitle",{name:tripName})}</h1><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"><span className={meta}><MapPin className="size-3.5" aria-hidden="true"/>{data.trip.destination}</span><span className={meta}><CalendarDays className="size-3.5" aria-hidden="true"/>{formatDateOnly(data.trip.starts_on ?? "",locale)} – {formatDateOnly(data.trip.ends_on ?? "",locale)}</span>{participants?<span className={meta}><UsersRound className="size-3.5" aria-hidden="true"/>{participants}</span>:null}{data.trip.project_id?<Link className={`${meta} hover:bg-[var(--ui-surface-muted)]`} href={`/projects/${data.trip.project_id}?view=finance`}><FolderKanban className="size-3.5" aria-hidden="true"/><span>{options.projects.find(v=>v.id===data.trip.project_id)?.name}</span><ArrowUpRight className="size-3" aria-hidden="true"/></Link>:null}{data.trip.calendar_event_id?<Link className={`${meta} hover:bg-[var(--ui-surface-muted)]`} href={`/calendar?event=${data.trip.calendar_event_id}&date=${data.trip.starts_on}`}><CalendarCheck2 className="size-3.5" aria-hidden="true"/>{t("calendarSynced")}<ArrowUpRight className="size-3" aria-hidden="true"/></Link>:null}<span className="rounded-full border border-[var(--ui-border)] px-2 py-1 text-xs text-[var(--ui-text-muted)]">{t(`statuses.${status}`)}</span></div></div>{!data.trip.calendar_source_id?<Button variant="outline" onClick={()=>setEditor("trip")}>{f("edit")}</Button>:null}</div>
    {warning?<p role="status" className="rounded border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] px-4 py-2 text-sm">{t(data.trip.calendar_state!=="active"?"calendarChanged":"calendarProjectRetained")}</p>:null}
    {data.trip.note?<p className={quiet}>{data.trip.note}</p>:null}
    <div className={panel}><dl className="grid grid-cols-1 divide-y divide-[var(--ui-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0"><div data-trip-summary="plan" className="flex min-w-0 items-baseline justify-between gap-3 px-3 py-2 sm:block sm:px-5 sm:py-4"><dt className="text-xs font-medium text-[var(--ui-text-muted)]">{t("plan")}</dt><dd className="mt-1 whitespace-nowrap text-sm font-medium tabular-nums sm:text-lg"><button className="rounded text-left focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" aria-label={t("openPlan")} onClick={()=>document.querySelector<HTMLButtonElement>("[data-plan-trigger]")?.focus()}>{data.trip.planned_amount===null?t("notPlanned"):`≈ ${money(data.trip.planned_amount)}`}</button></dd></div><div data-trip-summary="actual" className="flex min-w-0 items-baseline justify-between gap-3 bg-[var(--ui-surface-subtle)] px-3 py-2 sm:block sm:px-5 sm:py-4"><dt className="text-xs font-semibold text-[var(--ui-text-secondary)]">{t("actual")}</dt><dd className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums sm:text-xl">{money(data.trip.actual_amount)}</dd></div><div data-trip-summary="variance" className="flex min-w-0 items-baseline justify-between gap-3 px-3 py-2 sm:block sm:px-5 sm:py-4"><dt className="text-xs font-medium text-[var(--ui-text-muted)]">{t("variance")}</dt><dd className="mt-1 whitespace-nowrap text-sm font-medium tabular-nums sm:text-lg">{hasActual && data.trip.variance!==null?money(data.trip.variance):"—"}</dd></div></dl><div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--ui-border)] px-3 py-2 text-xs text-[var(--ui-text-secondary)] sm:px-5"><span>{t("studioPaid")} <strong className="ml-1 tabular-nums">{money(data.trip.studio_paid)}</strong></span><span>{t("employeePaid")} <strong className="ml-1 tabular-nums">{money(sum(data.entries.filter(e=>e.kind==="expense" && e.employee_id)))}</strong></span>{due.length?<a className="rounded font-medium hover:text-[var(--ui-text)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" href="#trip-settlements">{t("settlementsDue",{count:due.length})}</a>:null}{data.trip.plan_incomplete?<span>{t("estimateUnavailable")}</span>:null}</div></div>
    <TripExpenseSheet data={data} foundation={foundation} today={today}/>
    <section id="trip-settlements" className={`${panel} px-4 py-2 sm:px-5`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{t("balances")}</h2>{data.trip.status!=="cancelled"?<Button size="sm" variant="outline" onClick={()=>setEditor("advance")} disabled={!data.travelers.some(v=>v.active)}>{t("issueAdvance")}</Button>:null}</div>
      {due.map(v=><div key={v.expected_item_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--ui-border)] py-2 text-sm"><p>{data.travelers.find(p=>p.employee_id===v.employee_id)?.employee_name} · {t(v.direction==="outgoing"?"toReimburse":"toReturn")} <strong className="tabular-nums">{money(v.expected?.remaining_amount ?? "0",v.currency)}</strong></p><Link className="inline-flex min-h-11 items-center rounded px-2 text-sm font-medium hover:bg-[var(--ui-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" href={`/finance/movements?expected=${v.expected_item_id}`}>{t(v.direction==="outgoing"?"reimburse":"recordReturn")}</Link></div>)}
      {!due.length && !unusedAdvances.length?<p className="py-2 text-xs text-[var(--ui-text-muted)]">{t("nothingDue")}</p>:null}
      {unusedAdvances.map(v=><p key={`${v.employee}-${v.currency}`} className="border-t border-[var(--ui-border)] py-2 text-sm">{v.employee} · {t("advanceToReconcile")} <strong>{money(v.amount,v.currency)}</strong></p>)}
      {data.entries.some(e=>e.kind==="advance") || data.balances.length?<AnimatedDisclosure title={t("settlementHistory")}><div className="space-y-1 pb-2">{data.entries.filter(e=>e.kind==="advance").map(e=><p key={e.id} className="flex flex-wrap justify-between gap-2 py-1 text-xs"><span>{data.travelers.find(v=>v.employee_id===e.employee_id)?.employee_name} · {formatDateOnly(e.financial_date ?? "",locale)}</span><span className="tabular-nums">{money(e.net_amount,e.currency ?? base.code)}</span></p>)}{data.balances.map(v=><Link key={v.expected_item_id} className="mr-4 inline-flex min-h-9 items-center rounded text-xs focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" href={`/finance/expected?item=${v.expected_item_id}`}>{data.travelers.find(p=>p.employee_id===v.employee_id)?.employee_name} · {v.currency}</Link>)}</div></AnimatedDisclosure>:null}
    </section>
    {data.estimates.needed.length?<AnimatedDisclosure title={t("planFxAssumptions")} className={`${panel} px-4`}><form method="get" className="space-y-3 pb-3"><p className="text-xs text-[var(--ui-text-muted)]">{t("planFxHelp")}</p><div className="grid gap-3 sm:grid-cols-3">{data.estimates.needed.map(code=><FormField key={code} label={f("movements.rate",{currency:code,base:base.code})}><Input name={`fx_${code}`} inputMode="decimal" defaultValue={data.estimates.fx.find(v=>v.currency===code && v.source==="manual")?.rate ?? ""}/></FormField>)}</div><Button type="submit" variant="outline">{t("applyAssumptions")}</Button></form></AnimatedDisclosure>:null}
    <Dialog isOpen={Boolean(editor)} onRequestClose={()=>{if(!pending)setEditor(null);}} closeDisabled={pending} closeLabel={f("close")} title={editor==="trip"?f("edit"):t("issueAdvance")} className="sm:max-w-3xl">{editor==="trip"?<TripForm options={options} detail={data} today={today} onPending={setPending} onSaved={saved}/>:editor?<TripEntryEditor kind="advance" expenseType="other" data={data} foundation={foundation} today={today} onSaved={saved} onPending={setPending} onCancel={()=>setEditor(null)}/>:null}</Dialog>
  </div>;
}
