"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Plus, ArrowLeft, MapPin } from "lucide-react";
import { getProjectReferenceRate } from "@/app/(app)/finance/project-actions";
import { projectReferenceValue } from "@/lib/finance-project-plan";
import { AnimatedFormContent, AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { saveFinanceTrip } from "@/app/(app)/finance/trips/actions";
import type { getFinanceData } from "@/data/queries/finance";
import type { FinanceTripData, FinanceTripOptions, getFinanceTrips } from "@/data/queries/finance-trips";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { canChartFinanceAmount, formatFinanceAmount } from "@/lib/finance";
import { formatDateOnly } from "@/lib/utils";
import { sumTripMoney, tripDays, tripExpenseTypes, tripPerDiem, tripStatuses } from "@/lib/finance-trips";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";
import { FinanceFxFields } from "./finance-fx-fields";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";
const quiet = "text-sm text-[var(--ui-text-muted)]";
const link = "inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";

function TripForm({ options, detail, projectId, today, onSaved, onPending }: { options: FinanceTripOptions; detail?: FinanceTripData; projectId?: string; today: string; onSaved: (id?: string) => void; onPending: (v: boolean) => void }) {
  const t = useTranslations("Finance.trips"), f = useTranslations("Finance");
  const locale = useLocale();
  const trip = detail?.trip;
  const [start, setStart] = useState(trip?.starts_on ?? today), [end, setEnd] = useState(trip?.ends_on ?? today);
  const [project, setProject] = useState(trip?.project_id ?? projectId ?? "none");
  const [status, setStatus] = useState(trip?.status ?? "planned");
  if (detail && trip?.calendar_source_id) return <FinanceActionForm className="space-y-4 p-4 sm:p-6" action={saveFinanceTrip} onSaved={s => onSaved(s.id)} onPending={onPending} label={f("planning.save")}>
    <input type="hidden" name="intent" value="trip"/><input type="hidden" name="id" value={trip.id ?? ""}/><input type="hidden" name="version" value={trip.version ?? 0}/>
    {Object.entries({title:trip.title,destination:trip.destination,startsOn:trip.starts_on,endsOn:trip.ends_on,projectId:trip.project_id,note:trip.note}).map(([name,value])=><input key={name} type="hidden" name={name} value={value ?? ""}/>)}
    {detail.travelers.filter(v=>v.active).map(v=><input key={v.employee_id} type="hidden" name="travelers" value={v.employee_id}/>)}
    <p className={quiet}>{t("calendarOwned")}</p>
    <FormField label={t("status")}><Select name="status" aria-label={t("status")} value={status} onValueChange={setStatus}>{tripStatuses.map(v=><SelectItem key={v} value={v}>{t(`statuses.${v}`)}</SelectItem>)}</Select></FormField>
  </FinanceActionForm>;
  return <FinanceActionForm className="space-y-4 p-4 sm:p-6" action={saveFinanceTrip} onSaved={s => onSaved(s.id)} onPending={onPending} label={f("planning.save")}>
    <input type="hidden" name="intent" value="trip"/><input type="hidden" name="id" value={trip?.id ?? ""}/><input type="hidden" name="version" value={trip?.version ?? 0}/>
    <FormField label={t("name")}><Input name="title" defaultValue={trip?.title ?? ""} maxLength={160} required data-dialog-initial-focus/></FormField>
    <FormField label={t("destination")}><Input name="destination" defaultValue={trip?.destination ?? ""} maxLength={160} required/></FormField>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("start")}><DatePicker locale={locale} name="startsOn" value={start} onValueChange={v => { setStart(v); if (end < v) setEnd(v); }} required/></FormField><FormField label={t("end")}><DatePicker locale={locale} name="endsOn" value={end} min={start} onValueChange={setEnd} required/></FormField></div>
    <FormField label={t("project")}><input type="hidden" name="projectId" value={project === "none" ? "" : project}/><Select aria-label={t("project")} value={project} onValueChange={setProject} disabled={Boolean(detail?.entries.length)}><SelectItem value="none">{t("noProject")}</SelectItem>{options.projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</Select></FormField>
    {detail?.entries.length ? <p className={quiet}>{t("projectHistory")}</p> : null}
    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">{t("travelers")}</legend><div className="grid gap-2 sm:grid-cols-2">{options.members.filter(m => m.is_active && m.profile.is_active || detail?.travelers.some(v => v.employee_id === m.user_id)).map(m => <label key={m.user_id} className="flex min-h-11 items-center gap-2 rounded border border-[var(--ui-border)] px-3 text-sm"><input type="checkbox" name="travelers" value={m.user_id} defaultChecked={detail?.travelers.some(v => v.employee_id === m.user_id && v.active)}/>{m.profile.full_name}</label>)}</div></fieldset>
    <FormField label={t("status")}><Select name="status" aria-label={t("status")} value={status} onValueChange={setStatus}>{tripStatuses.map(v => <SelectItem key={v} value={v}>{t(`statuses.${v}`)}</SelectItem>)}</Select></FormField>
    <FormField label={t("note")}><Textarea name="note" defaultValue={trip?.note ?? ""} rows={2} maxLength={2000}/></FormField>
  </FinanceActionForm>;
}

function EntryForm({ kind, initialType = "travel", data, foundation, today, onSaved, onPending }: { kind: "plan" | "expense" | "advance"; initialType?: string; data: FinanceTripData; foundation: Foundation; today: string; onSaved: () => void; onPending: (v: boolean) => void }) {
  const t = useTranslations("Finance.trips"), f = useTranslations("Finance"), locale = useLocale();
  const base = foundation.settings?.base_currency ?? "UAH";
  const [type, setType] = useState(kind === "advance" ? "travel" : initialType), [payer, setPayer] = useState(kind === "advance" ? data.travelers.find(v => v.active)?.employee_id ?? "" : "studio");
  const [accountId, setAccountId] = useState(foundation.accounts.find(v => !v.archived_at)?.id ?? "");
  const [currency, setCurrency] = useState(base), [date, setDate] = useState(today), [amount, setAmount] = useState("");
  const [mode, setMode] = useState("record"), [movementId, setMovementId] = useState(""), [planId, setPlanId] = useState("none");
  const [perDiem, setPerDiem] = useState(false), [rate, setRate] = useState(""), [days, setDays] = useState(String(Math.min(366, tripDays(data.trip.starts_on ?? today, data.trip.ends_on ?? today))));
  const [covered, setCovered] = useState(data.travelers.filter(v=>v.active).map(v=>v.employee_id));
  const [referenceRate, setReferenceRate] = useState<{currency: string; rate: string | null} | null>(null);
  const [forecast, setForecast] = useState(false), [expectedDate, setExpectedDate] = useState(data.trip.starts_on ?? today);
  const cash = kind === "advance" || kind === "expense" && payer === "studio";
  const matched = cash && mode === "match";
  const account = foundation.accounts.find(v => v.id === accountId), movement = data.payments.find(v => v.id === movementId);
  const code = cash ? matched ? movement?.currency ?? base : account?.currency ?? base : currency;
  const units = foundation.currencies.find(v => v.code === code)?.minor_units ?? 2;
  let calculated = "";
  if (perDiem && type === "meals") { try { calculated = tripPerDiem(rate, Number(days), units, covered.length); } catch { /* Keep invalid input visible until corrected. */ } }
  useEffect(() => {
    if (kind !== "plan" || code === base) return;
    let cancelled = false;
    const known = data.estimates.fx.find(f=>f.currency===code)?.rate;
    if (!known) void getProjectReferenceRate(code).then(value=>{if (!cancelled) setReferenceRate({currency:code,rate:value?.rate ?? null});}).catch(()=>{if (!cancelled) setReferenceRate({currency:code,rate:null});});
    return () => {cancelled=true;};
  },[kind,code,base,data.estimates.fx]);
  const estimateRate = data.estimates.fx.find(f=>f.currency===code)?.rate ?? (referenceRate?.currency===code ? referenceRate.rate : null);
  let estimate: string | null = null;
  try { if (estimateRate) estimate=projectReferenceValue(perDiem ? calculated : amount,estimateRate,units,data.estimates.digits); } catch { /* Draft amounts may be incomplete. */ }
  const plans = data.entries.filter(e => e.kind === "plan" && !e.reverses_id && !data.entries.some(v => v.reverses_id === e.id || v.plan_id === e.id));
  return <FinanceActionForm className="space-y-4 p-4 sm:p-6" action={saveFinanceTrip} onSaved={onSaved} onPending={onPending} label={f("planning.save")} disabled={matched && !movementId || perDiem && !calculated}>
    <input type="hidden" name="intent" value="entry"/><input type="hidden" name="tripId" value={data.trip.id ?? ""}/><input type="hidden" name="kind" value={kind}/>
    <input type="hidden" name="employeeId" value={kind === "plan" || payer === "studio" ? "" : payer}/>
    {kind !== "advance" ? <FormField label={t("expenseType")}><Select name="expenseType" aria-label={t("expenseType")} value={type} onValueChange={v => { setType(v); setPerDiem(false); }}>{tripExpenseTypes.map(v => <SelectItem key={v} value={v}>{t(`types.${v}`)}</SelectItem>)}</Select></FormField> : <input type="hidden" name="expenseType" value="other"/>}
    {type === "other" ? <FormField label={t("customLabel")}><Input name="label" maxLength={160}/></FormField> : null}
    {kind !== "plan" ? <FormField label={kind === "advance" ? t("traveler") : t("paidBy")}><Select aria-label={kind === "advance" ? t("traveler") : t("paidBy")} value={payer} onValueChange={setPayer}>{kind !== "advance" ? <SelectItem value="studio">{t("studioAccount")}</SelectItem> : null}{data.travelers.filter(v => v.active).map(v => <SelectItem key={v.employee_id} value={v.employee_id}>{v.employee_name}</SelectItem>)}</Select></FormField> : null}
    {cash ? <><FormField label={t("payment")}><Select aria-label={t("payment")} value={mode} onValueChange={v => { setMode(v); setPerDiem(false); }}><SelectItem value="record">{t("recordPayment")}</SelectItem><SelectItem value="match">{t("matchPayment")}</SelectItem></Select></FormField>{matched ? <FormField label={t("existingPayment")}><Select name="movementId" aria-label={t("existingPayment")} value={movementId} onValueChange={setMovementId} required>{data.payments.filter(v => Number(v.original_amount) === Number(v.unapplied_amount) || v.planId === planId).map(v => <SelectItem key={v.id} value={v.id ?? ""}>{formatDateOnly(v.financial_date ?? "", locale)} · {v.description || foundation.accounts.find(a => a.id === v.account_id)?.name} · {v.original_amount} {v.currency}</SelectItem>)}</Select><p className={quiet}>{t("matchHelp")}</p></FormField> : <FormField label={f("movements.account")}><Select name="accountId" aria-label={f("movements.account")} value={accountId} onValueChange={setAccountId} required>{foundation.accounts.filter(v => !v.archived_at).map(v => <SelectItem key={v.id} value={v.id}>{v.name} · {v.currency}</SelectItem>)}</Select></FormField>}</> : null}
    {type === "meals" && !matched ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={perDiem} onChange={e => setPerDiem(e.target.checked)}/>{t("perDiem")}</label> : null}
    <AnimatedFormContent isOpen={perDiem && type === "meals"}><fieldset disabled={!perDiem} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("dailyRate")}><Input name="dailyRate" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} required={perDiem}/></FormField><FormField label={t("days")}><Input name="dayCount" type="number" min={1} max={366} value={days} onChange={e=>setDays(e.target.value)} required={perDiem}/></FormField></div>
      <fieldset><legend className="mb-2 text-sm font-medium">{t("coveredTravelers",{count:covered.length})}</legend><div className="grid gap-2 sm:grid-cols-2">{data.travelers.filter(v=>v.active).map(v=><label key={v.employee_id} className="flex min-h-11 items-center gap-2 rounded border border-[var(--ui-border)] px-3 text-sm"><input type="checkbox" name="coveredTravelerIds" value={v.employee_id} checked={covered.includes(v.employee_id)} onChange={e=>setCovered(ids=>e.target.checked ? [...ids,v.employee_id] : ids.filter(id=>id!==v.employee_id))}/>{v.employee_name}</label>)}</div></fieldset>
      <p className={quiet}>{t("perDiemHelp")}</p><p aria-live="polite" className="text-sm font-medium tabular-nums">{calculated ? t("calculation",{rate,currency:code,days,count:covered.length,total:calculated}) : t("chooseCoverage")}</p>
    </fieldset></AnimatedFormContent>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label={f("movements.amount")}><Input name="amount" inputMode="decimal" value={matched ? movement?.original_amount ?? "" : perDiem ? calculated : amount} readOnly={matched || perDiem} onChange={e => setAmount(e.target.value)} required/></FormField><FormField label={t("currency")}>{cash ? <><Input value={code} readOnly/><input type="hidden" name="currency" value={code}/></> : <FinanceCurrencySelect aria-label={t("currency")} name="currency" currencies={foundation.currencies} reportingCurrency={base} value={currency} onValueChange={v=>{setCurrency(v);setReferenceRate(null);}}/>}</FormField></div>
    {kind === "plan" ? <input type="hidden" name="date" value={today}/> : matched ? <><input type="hidden" name="date" value={movement?.financial_date ?? today}/><p className={quiet}>{movement?.financial_date ? formatDateOnly(movement.financial_date, locale) : ""}</p></> : <FormField label={f("movements.date")}><DatePicker locale={locale} name="date" value={date} onValueChange={setDate} min={foundation.settings?.cutover_date} max={today} required/></FormField>}
    {!matched && kind !== "plan" ? <FinanceFxFields key={code} currency={code} base={base}/> : null}
    {kind === "plan" && code!==base ? <p className={quiet} aria-live="polite">{estimate ? `${perDiem ? calculated : amount} ${code} ≈ ${estimate} ${base}` : t("estimateUnavailable")}<span className="mt-1 block">{t("planFxHelp")}</span></p> : null}
    {kind === "plan" ? <><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={forecast} onChange={e => setForecast(e.target.checked)}/>{t("includeForecast")}</label><AnimatedFormContent isOpen={forecast}><fieldset disabled={!forecast}><FormField label={t("expectedDate")}><DatePicker locale={locale} name="expectedDate" value={expectedDate} onValueChange={setExpectedDate} required={forecast}/><span className={quiet}>{t("forecastHelp")}</span></FormField></fieldset></AnimatedFormContent></> : null}
    {kind === "expense" && plans.length ? <FormField label={t("replacesPlan")}><input type="hidden" name="planId" value={planId === "none" ? "" : planId}/><Select aria-label={t("replacesPlan")} value={planId} onValueChange={setPlanId}><SelectItem value="none">{t("unplanned")}</SelectItem>{plans.map(v => <SelectItem key={v.id} value={v.id ?? ""}>{v.label || t(`types.${v.expense_type}`)} · {v.amount} {v.currency}</SelectItem>)}</Select><span className={quiet}>{t("replaceHelp")}</span></FormField> : null}
    <FormField label={t("note")}><Textarea name="note" rows={2} maxLength={2000}/></FormField>
    {kind === "expense" && payer !== "studio" ? <p className={quiet}>{t("personalHelp")}</p> : null}
  </FinanceActionForm>;
}

export function FinanceTripsWorkspace({ foundation, options, trips, today, projectId }: { foundation: Foundation; options: FinanceTripOptions; trips: NonNullable<Awaited<ReturnType<typeof getFinanceTrips>>>; today: string; projectId?: string }) {
  const t = useTranslations("Finance.trips"), f = useTranslations("Finance"), locale = useLocale(), router = useRouter();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const base = foundation.currencies.find(v => v.code === foundation.settings?.base_currency);
  return <div className="space-y-6"><PageHeader className="flex-col items-start sm:flex-row sm:items-center" title={t("title")} description={t("description")} action={foundation.settings?.finalized_at ? <Button onClick={() => setOpen(true)}><Plus className="mr-2 size-4"/>{t("addTrip")}</Button> : undefined}/>
    {!base || !foundation.settings?.finalized_at ? <Link className={link} href="/finance/accounts">{t("setup")}</Link> : trips.length ? <div className={`${panel} divide-y divide-[var(--ui-border)]`}>{trips.map(trip => <Link key={trip.id} href={`/finance/trips/${trip.id}`} className="flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">{trip.title}</h2><p className={`mt-1 ${quiet}`}>{trip.destination} · {formatDateOnly(trip.starts_on ?? "", locale)} – {formatDateOnly(trip.ends_on ?? "", locale)}</p>{trip.project_id ? <p className={quiet}>{options.projects.find(p => p.id === trip.project_id)?.name}</p> : null}</div><div className="flex flex-wrap items-center gap-4 text-sm"><span className={quiet}>{t(`statuses.${trip.status}`)}</span><dl className="grid w-full gap-2 tabular-nums sm:w-auto sm:grid-cols-3 sm:gap-6">{[[t("plan"),trip.planned_amount],[t("actual"),trip.actual_amount],[t("variance"),trip.variance]].map(([label,value])=><div key={label} className="flex items-baseline justify-between gap-3 sm:block"><dt className={quiet}>{label}</dt><dd className="whitespace-nowrap font-medium sm:mt-1">{value===null ? "—" : `${label===t("plan") && trip.has_plan ? "≈ " : ""}${formatFinanceAmount(value ?? "0",base,locale)}`}</dd></div>)}</dl></div></Link>)}</div> : <div className={`${panel} p-8`}><p className="font-medium">{t("empty")}</p><p className={`mt-2 ${quiet}`}>{t("emptyHelp")}</p></div>}
    <Dialog isOpen={open} onRequestClose={() => { if (!pending) setOpen(false); }} closeDisabled={pending} closeLabel={f("close")} title={t("addTrip")} className="sm:max-w-xl">{open ? <TripForm options={options} today={today} projectId={projectId} onPending={setPending} onSaved={id => { setOpen(false); router.push(`/finance/trips/${id}`); router.refresh(); }}/> : null}</Dialog>
  </div>;
}

export function FinanceTripWorkspace({ data, foundation, options, today }: { data: FinanceTripData; foundation: Foundation; options: FinanceTripOptions; today: string }) {
  const t = useTranslations("Finance.trips"), f = useTranslations("Finance"), locale = useLocale(), router = useRouter();
  const [editor, setEditor] = useState<"trip" | "plan" | "expense" | "advance" | null>(null), [pending, setPending] = useState(false);
  const [correction, setCorrection] = useState<FinanceTripData["entries"][number] | null>(null);
  const [tab, setTab] = useState(data.trip.status === "planned" ? "plan" : "expense");
  const [entryType,setEntryType] = useState("travel");
  const base = foundation.currencies.find(v => v.code === data.trip.reporting_currency);
  if (!base) return null;
  const money = (amount: string | null, currency = base.code) => {
    const unit = foundation.currencies.find(v => v.code === currency);
    return unit ? formatFinanceAmount(amount ?? "0", unit, locale) : `${amount} ${currency}`;
  };
  const sum = (entries: FinanceTripData["entries"]) => sumTripMoney(entries.map(e => e.net_reporting_amount ?? "0"), base.minor_units);
  const unusedAdvances = ["planned", "active"].includes(data.trip.status ?? "") ? data.travelers.flatMap(person => [...new Set(data.entries.filter(e => e.employee_id === person.employee_id).map(e => e.currency))].flatMap(currency => {
    const digits = foundation.currencies.find(v => v.code === currency)?.minor_units;
    if (digits === undefined || !currency) return [];
    const entries = data.entries.filter(e => e.employee_id === person.employee_id && e.currency === currency && e.kind !== "plan");
    const settlements = data.balances.filter(b => b.employee_id === person.employee_id && b.currency === currency);
    const balance = sumTripMoney([...entries.map(e => e.kind === "advance" ? `-${e.net_amount}` : e.net_amount), ...settlements.map(b => `${b.direction === "outgoing" ? "-" : ""}${b.expected?.settled_amount ?? "0"}`)], digits);
    return balance.startsWith("-") && Number(balance) < 0 ? [{ employee: person.employee_name, currency, amount: balance.slice(1) }] : [];
  })) : [];
  const totals: [string, string | null][] = [[t("plan"), data.trip.planned_amount], [t("actual"), data.trip.actual_amount], [t("variance"), data.trip.variance]];
  const saved = () => { if (editor === "plan" || editor === "expense" || editor === "advance") setTab(editor); setEditor(null); setCorrection(null); router.refresh(); };
  return <div className="space-y-6">
    <Link className={link} href="/finance/trips"><ArrowLeft className="mr-2 size-4"/>{t("title")}</Link>
    <PageHeader className="flex-col items-start sm:flex-row sm:items-center" title={data.trip.title ?? ""} description={`${data.trip.destination} · ${formatDateOnly(data.trip.starts_on ?? "", locale)} – ${formatDateOnly(data.trip.ends_on ?? "", locale)}`} action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditor("trip")}>{f("edit")}</Button>{data.trip.status !== "cancelled" ? <Button onClick={() => setEditor("expense")}><Plus className="mr-2 size-4"/>{t("addExpense")}</Button> : null}</div>}/>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className={quiet}>{t(`statuses.${data.trip.status}`)}</span><span>{data.travelers.filter(v => v.active).map(v => v.employee_name).join(", ")}</span>{data.trip.project_id ? <Link className={link} href={`/projects/${data.trip.project_id}?view=finance`}><MapPin className="mr-1 size-3.5"/>{options.projects.find(v => v.id === data.trip.project_id)?.name}</Link> : null}</div>
    {data.trip.note ? <p className={quiet}>{data.trip.note}</p> : null}
    {data.trip.calendar_source_id ? <div className={`${panel} flex flex-wrap items-center justify-between gap-3 p-4`}><div><p className="text-sm font-medium">{t("fromCalendar")}</p><p className={quiet}>{t(data.trip.calendar_state==="active" ? "calendarOwned" : "calendarChanged")}</p>{data.calendar && data.calendar.project_id!==data.trip.project_id ? <p className={quiet}>{t("calendarProjectRetained")}</p> : null}</div>{data.trip.calendar_event_id ? <Link className={link} href={`/calendar?event=${data.trip.calendar_event_id}&date=${data.trip.starts_on}`}>{t("openCalendar")}</Link> : null}</div> : null}
    <dl className={`${panel} grid divide-y divide-[var(--ui-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0`}>{totals.map(([label,value],index)=><div key={label} className="p-4 sm:p-5"><dt className={quiet}>{label}</dt><dd className="mt-2 break-words text-2xl font-semibold tabular-nums">{index===0 ? <button className="text-left underline decoration-[var(--ui-border)] underline-offset-4 focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={()=>{setTab("plan");document.getElementById("trip-entries")?.scrollIntoView({block:"nearest"});}} aria-label={t("openPlan")}>{value===null ? "—" : `≈ ${money(value)}`}</button> : value===null ? "—" : money(value)}</dd>{index===0 ? <p className={`mt-2 ${quiet}`}>{t(!data.trip.has_plan ? "noPlan" : data.trip.plan_incomplete ? "estimateUnavailable" : "currentEstimate")}</p> : null}</div>)}</dl>
    {!data.trip.has_plan && data.trip.status!=="cancelled" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border)] p-4"><div><p className="text-sm font-medium">{t("noPlan")}</p><p className={quiet}>{t("noPlanHelp")}</p></div><Button variant="outline" onClick={()=>{setEntryType("travel");setEditor("plan");}}><Plus className="mr-2 size-4"/>{t("addPlan")}</Button></div> : null}
    {data.estimates.needed.length ? <AnimatedDisclosure title={t("planFxAssumptions")} className={`${panel} px-4`}><form method="get" className="space-y-3 pb-4"><p className={quiet}>{t("planFxHelp")}</p><div className="grid gap-3 sm:grid-cols-3">{data.estimates.needed.map(code=><FormField key={code} label={f("movements.rate",{currency:code,base:base.code})}><Input name={`fx_${code}`} inputMode="decimal" defaultValue={data.estimates.fx.find(v=>v.currency===code && v.source==="manual")?.rate ?? ""}/></FormField>)}</div><Button type="submit" variant="outline">{t("applyAssumptions")}</Button></form></AnimatedDisclosure> : null}
    <section id="trip-entries" className={panel}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] p-4"><div className="flex flex-wrap gap-1" role="group" aria-label={t("history")} >{["expense", "plan", "advance"].map(v => <Button key={v} variant={tab === v ? "outline" : "ghost"} size="sm" aria-pressed={tab === v} onClick={() => setTab(v)}>{t(`entries.${v}`)}</Button>)}</div>{data.trip.status !== "cancelled" && data.trip.has_plan ? <Button size="sm" variant="outline" onClick={() => {setEntryType("travel");setEditor("plan");}}>{t("addPlan")}</Button> : null}</div>
      {tab==="plan" && data.trip.status!=="cancelled" ? <div className="flex flex-wrap gap-2 border-b border-[var(--ui-border)] p-4">{tripExpenseTypes.map(type=><Button key={type} size="sm" variant="ghost" onClick={()=>{setEntryType(type);setEditor("plan");}}><Plus className="mr-1 size-3.5"/>{t(`types.${type}`)}</Button>)}</div> : null}
      <div className="divide-y divide-[var(--ui-border)]">{data.entries.filter(e => e.kind === tab).map(e => <div key={e.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row"><div><p className="text-sm font-medium">{e.label || t(`types.${e.expense_type}`)}{e.reverses_id ? ` · ${t("correction")}` : ""}</p><p className={`mt-1 ${quiet}`}>{formatDateOnly(e.financial_date ?? "", locale)} · {e.employee_id ? data.travelers.find(v => v.employee_id === e.employee_id)?.employee_name : t(e.kind === "plan" ? "plan" : "studioAccount")}</p>{e.note ? <p className={`mt-1 ${quiet}`}>{e.note}</p> : null}{e.day_count ? <p className={`mt-1 ${quiet}`}>{t("calculation",{rate:e.daily_rate ?? "",currency:e.currency ?? "",days:e.day_count,count:e.traveler_count ?? 1,total:e.amount})}</p> : null}<div className="flex flex-wrap gap-3">{e.movement_id ? <Link className={link} href="/finance/movements">{t("ledger")}</Link> : null}{e.expected_item_id ? <Link className={link} href={`/finance/expected?item=${e.expected_item_id}`}>{t("settlementHistory")}</Link> : null}{!e.movement_id && !e.reverses_id && !data.entries.some(v => v.reverses_id === e.id || v.plan_id === e.id) ? <button className={link} onClick={() => setCorrection(e)}>{t("correct")}</button> : null}</div></div><div className="text-sm tabular-nums sm:text-right"><p className="font-medium">{money(e.amount, e.currency ?? base.code)}</p>{e.currency !== base.code ? <p className={`mt-1 ${quiet}`}>{e.kind==="plan" ? data.estimates.values[e.id ?? ""] ? `≈ ${money(data.estimates.values[e.id ?? ""])}` : t("estimateUnavailable") : `${money(e.reporting_amount)} · ${e.fx_source}`}</p> : null}{e.net_amount !== e.amount && Number(e.net_amount) !== Number(e.amount) ? <p className={quiet}>{t("netCost")} {money(e.net_amount, e.currency ?? base.code)}</p> : null}</div></div>)}</div>{!data.entries.some(e => e.kind === tab) ? <p className={`p-5 ${quiet}`}>{t("noEntries")}</p> : null}
    </section>
    <div className="grid gap-6 lg:grid-cols-2"><section className={`${panel} p-4 sm:p-5`}><h2 className="font-semibold">{t("whoPaid")}</h2><dl className="mt-4 space-y-3"><div className="flex justify-between gap-4 text-sm"><dt>{t("studioPaid")}</dt><dd className="tabular-nums">{money(data.trip.studio_paid)}</dd></div>{data.travelers.map(v => <div key={v.employee_id} className="flex justify-between gap-4 text-sm"><dt>{v.employee_name}</dt><dd className="tabular-nums">{money(sum(data.entries.filter(e => e.kind === "expense" && e.employee_id === v.employee_id)))}</dd></div>)}</dl><p className={`mt-4 ${quiet}`}>{t("costHelp")}</p></section>
    <section className={`${panel} p-4 sm:p-5`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t("balances")}</h2>{data.trip.status !== "cancelled" ? <Button size="sm" variant="outline" onClick={() => setEditor("advance")} disabled={!data.travelers.some(v => v.active)}>{t("issueAdvance")}</Button> : null}</div><div className="mt-3 divide-y divide-[var(--ui-border)]">{data.balances.filter(v => v.expected?.commitment !== "cancelled" && Number(v.expected?.remaining_amount) > 0).map(v => <div key={v.expected_item_id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-medium">{data.travelers.find(p => p.employee_id === v.employee_id)?.employee_name} · {money(v.expected?.remaining_amount ?? "0", v.currency)}</p><p className={quiet}>{t(v.direction === "outgoing" ? "toReimburse" : "toReturn")}</p></div><div className="flex gap-3"><Link className={link} href={`/finance/movements?expected=${v.expected_item_id}`}>{t(v.direction === "outgoing" ? "reimburse" : "recordReturn")}</Link><Link className={link} href={`/finance/expected?item=${v.expected_item_id}`}>{t("match")}</Link></div></div>)}</div>{!unusedAdvances.length && !data.balances.some(v => v.expected?.commitment !== "cancelled" && Number(v.expected?.remaining_amount) > 0) ? <p className={`mt-4 ${quiet}`}>{t("nothingDue")}</p> : null}{unusedAdvances.map(v => <div key={`${v.employee}-${v.currency}`} className="mt-3 text-sm"><p>{v.employee} · {money(v.amount,v.currency)}</p><p className={quiet}>{t("advanceToReconcile")}</p></div>)}<p className={`mt-4 ${quiet}`}>{t("balanceHelp")}</p>{unusedAdvances.length ? <p className={`mt-2 ${quiet}`}>{t("completeHelp")}</p> : null}</section></div>
    <section className={`${panel} p-4 sm:p-5`}><h2 className="font-semibold">{t("breakdown")}</h2><div className="mt-4 space-y-3">{tripExpenseTypes.map(type => {
      const amount = sum(data.entries.filter(e => e.kind === "expense" && e.expense_type === type));
      const width = Math.max(0, Math.min(100, Number(amount) / Math.max(1, Number(data.trip.actual_amount)) * 100));
      return <div key={type} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 text-sm"><span>{t(`types.${type}`)}</span><span className="tabular-nums">{money(amount)}</span>{canChartFinanceAmount(amount, base.minor_units) && canChartFinanceAmount(data.trip.actual_amount ?? "0", base.minor_units) ? <div className="col-span-2 h-1 rounded bg-[var(--ui-surface-muted)]" aria-hidden="true"><div className="h-full rounded bg-[var(--ui-border-strong)]" style={{ width: `${width}%` }}/></div> : null}</div>;
    })}</div></section>
    {data.balances.length ? <details className={`${panel} p-4`}><summary className="cursor-pointer text-sm font-medium">{t("settlementHistory")}</summary><div className="mt-3 flex flex-wrap gap-x-5">{data.balances.map(v => <Link key={v.expected_item_id} className={link} href={`/finance/expected?item=${v.expected_item_id}`}>{data.travelers.find(p => p.employee_id === v.employee_id)?.employee_name} · {v.currency} · {t(v.direction === "outgoing" ? "toReimburse" : "toReturn")}</Link>)}</div></details> : null}
    <Dialog isOpen={Boolean(editor)} onRequestClose={() => { if (!pending) setEditor(null); }} closeDisabled={pending} closeLabel={f("close")} title={editor === "trip" ? f("edit") : t(editor === "plan" ? "addPlan" : editor === "advance" ? "issueAdvance" : "addExpense")} className="sm:max-w-xl">{editor === "trip" ? <TripForm options={options} detail={data} today={today} onPending={setPending} onSaved={saved}/> : editor ? <EntryForm key={editor} initialType={entryType} kind={editor} data={data} foundation={foundation} today={today} onPending={setPending} onSaved={saved}/> : null}</Dialog>
    <Dialog isOpen={Boolean(correction)} onRequestClose={() => { if (!pending) setCorrection(null); }} closeDisabled={pending} closeLabel={f("close")} title={t("correct")} className="sm:max-w-lg">{correction ? <FinanceActionForm className="space-y-4 p-4 sm:p-6" action={saveFinanceTrip} onSaved={saved} onPending={setPending} label={t("confirmCorrection")}><input type="hidden" name="intent" value="correct"/><input type="hidden" name="tripId" value={data.trip.id ?? ""}/><input type="hidden" name="reversesId" value={correction.id ?? ""}/><p className={quiet}>{t("correctionHelp")}</p><FormField label={t("reason")}><Textarea name="note" required maxLength={2000}/></FormField></FinanceActionForm> : null}</Dialog>
  </div>;
}
