"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Plus, ArrowLeft, MapPin } from "lucide-react";
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

function EntryForm({ kind, data, foundation, today, onSaved, onPending }: { kind: "plan" | "expense" | "advance"; data: FinanceTripData; foundation: Foundation; today: string; onSaved: () => void; onPending: (v: boolean) => void }) {
  const t = useTranslations("Finance.trips"), f = useTranslations("Finance"), locale = useLocale();
  const base = foundation.settings?.base_currency ?? "UAH";
  const [type, setType] = useState("travel"), [payer, setPayer] = useState(kind === "advance" ? data.travelers.find(v => v.active)?.employee_id ?? "" : "studio");
  const [accountId, setAccountId] = useState(foundation.accounts.find(v => !v.archived_at)?.id ?? "");
  const [currency, setCurrency] = useState(base), [date, setDate] = useState(today), [amount, setAmount] = useState("");
  const [mode, setMode] = useState("record"), [movementId, setMovementId] = useState(""), [planId, setPlanId] = useState("none");
  const [perDiem, setPerDiem] = useState(false), [rate, setRate] = useState(""), [days, setDays] = useState(String(Math.min(366, tripDays(data.trip.starts_on ?? today, data.trip.ends_on ?? today))));
  const [forecast, setForecast] = useState(false), [expectedDate, setExpectedDate] = useState(data.trip.starts_on ?? today);
  const cash = kind === "advance" || kind === "expense" && payer === "studio";
  const matched = cash && mode === "match";
  const account = foundation.accounts.find(v => v.id === accountId), movement = data.payments.find(v => v.id === movementId);
  const code = cash ? matched ? movement?.currency ?? base : account?.currency ?? base : currency;
  const units = foundation.currencies.find(v => v.code === code)?.minor_units ?? 2;
  let calculated = "";
  if (perDiem && type === "meals") { try { calculated = tripPerDiem(rate, Number(days), units); } catch { /* Keep invalid input visible until corrected. */ } }
  const plans = data.entries.filter(e => e.kind === "plan" && !e.reverses_id && !data.entries.some(v => v.reverses_id === e.id || v.plan_id === e.id));
  return <FinanceActionForm className="space-y-4 p-4 sm:p-6" action={saveFinanceTrip} onSaved={onSaved} onPending={onPending} label={f("planning.save")} disabled={matched && !movementId || perDiem && !calculated}>
    <input type="hidden" name="intent" value="entry"/><input type="hidden" name="tripId" value={data.trip.id ?? ""}/><input type="hidden" name="kind" value={kind}/>
    <input type="hidden" name="employeeId" value={kind === "plan" || payer === "studio" ? "" : payer}/>
    {kind !== "advance" ? <FormField label={t("expenseType")}><Select name="expenseType" aria-label={t("expenseType")} value={type} onValueChange={v => { setType(v); setPerDiem(false); }}>{tripExpenseTypes.map(v => <SelectItem key={v} value={v}>{t(`types.${v}`)}</SelectItem>)}</Select></FormField> : <input type="hidden" name="expenseType" value="other"/>}
    {type === "other" ? <FormField label={t("customLabel")}><Input name="label" maxLength={160}/></FormField> : null}
    {kind !== "plan" ? <FormField label={kind === "advance" ? t("traveler") : t("paidBy")}><Select aria-label={kind === "advance" ? t("traveler") : t("paidBy")} value={payer} onValueChange={setPayer}>{kind !== "advance" ? <SelectItem value="studio">{t("studioAccount")}</SelectItem> : null}{data.travelers.filter(v => v.active).map(v => <SelectItem key={v.employee_id} value={v.employee_id}>{v.employee_name}</SelectItem>)}</Select></FormField> : null}
    {cash ? <><FormField label={t("payment")}><Select aria-label={t("payment")} value={mode} onValueChange={v => { setMode(v); setPerDiem(false); }}><SelectItem value="record">{t("recordPayment")}</SelectItem><SelectItem value="match">{t("matchPayment")}</SelectItem></Select></FormField>{matched ? <FormField label={t("existingPayment")}><Select name="movementId" aria-label={t("existingPayment")} value={movementId} onValueChange={setMovementId} required>{data.payments.filter(v => Number(v.original_amount) === Number(v.unapplied_amount) || v.planId === planId).map(v => <SelectItem key={v.id} value={v.id ?? ""}>{formatDateOnly(v.financial_date ?? "", locale)} · {v.description || foundation.accounts.find(a => a.id === v.account_id)?.name} · {v.original_amount} {v.currency}</SelectItem>)}</Select><p className={quiet}>{t("matchHelp")}</p></FormField> : <FormField label={f("movements.account")}><Select name="accountId" aria-label={f("movements.account")} value={accountId} onValueChange={setAccountId} required>{foundation.accounts.filter(v => !v.archived_at).map(v => <SelectItem key={v.id} value={v.id}>{v.name} · {v.currency}</SelectItem>)}</Select></FormField>}</> : null}
    {type === "meals" && !matched ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={perDiem} onChange={e => setPerDiem(e.target.checked)}/>{t("perDiem")}</label> : null}
    {perDiem && type === "meals" ? <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("dailyRate")}><Input name="dailyRate" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} required/></FormField><FormField label={t("days")}><Input name="dayCount" type="number" min={1} max={366} value={days} onChange={e => setDays(e.target.value)} required/></FormField><p className={quiet}>{t("perDiemHelp")}</p></div> : null}
    <div className="grid gap-4 sm:grid-cols-2"><FormField label={f("movements.amount")}><Input name="amount" inputMode="decimal" value={matched ? movement?.original_amount ?? "" : perDiem ? calculated : amount} readOnly={matched || perDiem} onChange={e => setAmount(e.target.value)} required/></FormField><FormField label={t("currency")}>{cash ? <><Input value={code} readOnly/><input type="hidden" name="currency" value={code}/></> : <FinanceCurrencySelect aria-label={t("currency")} name="currency" currencies={foundation.currencies} reportingCurrency={base} value={currency} onValueChange={setCurrency}/>}</FormField></div>
    {matched ? <><input type="hidden" name="date" value={movement?.financial_date ?? today}/><p className={quiet}>{movement?.financial_date ? formatDateOnly(movement.financial_date, locale) : ""}</p></> : <FormField label={kind === "plan" ? t("valuationDate") : f("movements.date")}><DatePicker locale={locale} name="date" value={date} onValueChange={setDate} min={kind === "plan" ? undefined : foundation.settings?.cutover_date} max={today} required/></FormField>}
    {!matched ? <FinanceFxFields key={code} currency={code} base={base}/> : null}
    {kind === "plan" ? <><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={forecast} onChange={e => setForecast(e.target.checked)}/>{t("includeForecast")}</label>{forecast ? <FormField label={t("expectedDate")}><DatePicker locale={locale} name="expectedDate" value={expectedDate} onValueChange={setExpectedDate} required/><span className={quiet}>{t("forecastHelp")}</span></FormField> : null}</> : null}
    {kind === "expense" && plans.length ? <FormField label={t("replacesPlan")}><input type="hidden" name="planId" value={planId === "none" ? "" : planId}/><Select aria-label={t("replacesPlan")} value={planId} onValueChange={setPlanId}><SelectItem value="none">{t("unplanned")}</SelectItem>{plans.map(v => <SelectItem key={v.id} value={v.id ?? ""}>{v.label || t(`types.${v.expense_type}`)} · {v.amount} {v.currency}</SelectItem>)}</Select><span className={quiet}>{t("replaceHelp")}</span></FormField> : null}
    <FormField label={t("note")}><Textarea name="note" rows={2} maxLength={2000}/></FormField>
    {kind === "expense" && payer !== "studio" ? <p className={quiet}>{t("personalHelp")}</p> : null}
  </FinanceActionForm>;
}

export function FinanceTripsWorkspace({ foundation, options, trips, today, projectId }: { foundation: Foundation; options: FinanceTripOptions; trips: NonNullable<Awaited<ReturnType<typeof getFinanceTrips>>>; today: string; projectId?: string }) {
  const t = useTranslations("Finance.trips"), f = useTranslations("Finance"), locale = useLocale(), router = useRouter();
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const base = foundation.currencies.find(v => v.code === foundation.settings?.base_currency);
  return <div className="space-y-6"><PageHeader title={t("title")} description={t("description")} action={foundation.settings?.finalized_at ? <Button onClick={() => setOpen(true)}><Plus className="mr-2 size-4"/>{t("addTrip")}</Button> : undefined}/>
    {!base || !foundation.settings?.finalized_at ? <Link className={link} href="/finance/accounts">{t("setup")}</Link> : trips.length ? <div className={`${panel} divide-y divide-[var(--ui-border)]`}>{trips.map(trip => <Link key={trip.id} href={`/finance/trips/${trip.id}`} className="flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">{trip.title}</h2><p className={`mt-1 ${quiet}`}>{trip.destination} · {formatDateOnly(trip.starts_on ?? "", locale)} – {formatDateOnly(trip.ends_on ?? "", locale)}</p>{trip.project_id ? <p className={quiet}>{options.projects.find(p => p.id === trip.project_id)?.name}</p> : null}</div><div className="flex items-center gap-6 text-sm"><span className={quiet}>{t(`statuses.${trip.status}`)}</span><div className="text-right tabular-nums"><p>{formatFinanceAmount(trip.actual_amount ?? "0", base, locale)}</p><p className={quiet}>{t("plan")} {formatFinanceAmount(trip.planned_amount ?? "0", base, locale)}</p></div></div></Link>)}</div> : <div className={`${panel} p-8`}><p className="font-medium">{t("empty")}</p><p className={`mt-2 ${quiet}`}>{t("emptyHelp")}</p></div>}
    <Dialog isOpen={open} onRequestClose={() => { if (!pending) setOpen(false); }} closeDisabled={pending} closeLabel={f("close")} title={t("addTrip")} className="sm:max-w-xl">{open ? <TripForm options={options} today={today} projectId={projectId} onPending={setPending} onSaved={id => { setOpen(false); router.push(`/finance/trips/${id}`); router.refresh(); }}/> : null}</Dialog>
  </div>;
}

export function FinanceTripWorkspace({ data, foundation, options, today }: { data: FinanceTripData; foundation: Foundation; options: FinanceTripOptions; today: string }) {
  const t = useTranslations("Finance.trips"), f = useTranslations("Finance"), locale = useLocale(), router = useRouter();
  const [editor, setEditor] = useState<"trip" | "plan" | "expense" | "advance" | null>(null), [pending, setPending] = useState(false);
  const [correction, setCorrection] = useState<FinanceTripData["entries"][number] | null>(null);
  const [tab, setTab] = useState("expense");
  const base = foundation.currencies.find(v => v.code === data.trip.reporting_currency);
  if (!base) return null;
  const money = (amount: string | null, currency = base.code) => {
    const unit = foundation.currencies.find(v => v.code === currency);
    return unit ? formatFinanceAmount(amount ?? "0", unit, locale) : `${amount} ${currency}`;
  };
  const sum = (entries: FinanceTripData["entries"]) => sumTripMoney(entries.map(e => e.net_reporting_amount), base.minor_units);
  const unusedAdvances = ["planned", "active"].includes(data.trip.status ?? "") ? data.travelers.flatMap(person => [...new Set(data.entries.filter(e => e.employee_id === person.employee_id).map(e => e.currency))].flatMap(currency => {
    const digits = foundation.currencies.find(v => v.code === currency)?.minor_units;
    if (digits === undefined || !currency) return [];
    const entries = data.entries.filter(e => e.employee_id === person.employee_id && e.currency === currency && e.kind !== "plan");
    const settlements = data.balances.filter(b => b.employee_id === person.employee_id && b.currency === currency);
    const balance = sumTripMoney([...entries.map(e => e.kind === "advance" ? `-${e.net_amount}` : e.net_amount), ...settlements.map(b => `${b.direction === "outgoing" ? "-" : ""}${b.expected?.settled_amount ?? "0"}`)], digits);
    return balance.startsWith("-") && Number(balance) < 0 ? [{ employee: person.employee_name, currency, amount: balance.slice(1) }] : [];
  })) : [];
  const totals: [string, string | null][] = [[t("plan"), data.trip.planned_amount], [t("actual"), data.trip.actual_amount], [t("variance"), data.trip.variance]];
  const saved = () => { setEditor(null); setCorrection(null); router.refresh(); };
  return <div className="space-y-6">
    <Link className={link} href="/finance/trips"><ArrowLeft className="mr-2 size-4"/>{t("title")}</Link>
    <PageHeader title={data.trip.title ?? ""} description={`${data.trip.destination} · ${formatDateOnly(data.trip.starts_on ?? "", locale)} – ${formatDateOnly(data.trip.ends_on ?? "", locale)}`} action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditor("trip")}>{f("edit")}</Button>{data.trip.status !== "cancelled" ? <Button onClick={() => setEditor("expense")}><Plus className="mr-2 size-4"/>{t("addExpense")}</Button> : null}</div>}/>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className={quiet}>{t(`statuses.${data.trip.status}`)}</span><span>{data.travelers.filter(v => v.active).map(v => v.employee_name).join(", ")}</span>{data.trip.project_id ? <Link className={link} href={`/projects/${data.trip.project_id}?view=finance`}><MapPin className="mr-1 size-3.5"/>{options.projects.find(v => v.id === data.trip.project_id)?.name}</Link> : null}</div>
    {data.trip.note ? <p className={quiet}>{data.trip.note}</p> : null}
    <dl className={`${panel} grid divide-y divide-[var(--ui-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0`}>{totals.map(([label, value]) => <div key={label} className="p-4 sm:p-5"><dt className={quiet}>{label}</dt><dd className="mt-2 break-words text-2xl font-semibold tabular-nums">{money(value)}</dd></div>)}</dl>
    <div className="grid gap-6 lg:grid-cols-2"><section className={`${panel} p-4 sm:p-5`}><h2 className="font-semibold">{t("whoPaid")}</h2><dl className="mt-4 space-y-3"><div className="flex justify-between gap-4 text-sm"><dt>{t("studioPaid")}</dt><dd className="tabular-nums">{money(data.trip.studio_paid)}</dd></div>{data.travelers.map(v => <div key={v.employee_id} className="flex justify-between gap-4 text-sm"><dt>{v.employee_name}</dt><dd className="tabular-nums">{money(sum(data.entries.filter(e => e.kind === "expense" && e.employee_id === v.employee_id)))}</dd></div>)}</dl><p className={`mt-4 ${quiet}`}>{t("costHelp")}</p></section>
    <section className={`${panel} p-4 sm:p-5`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t("balances")}</h2>{data.trip.status !== "cancelled" ? <Button size="sm" variant="outline" onClick={() => setEditor("advance")} disabled={!data.travelers.some(v => v.active)}>{t("issueAdvance")}</Button> : null}</div><div className="mt-3 divide-y divide-[var(--ui-border)]">{data.balances.filter(v => v.expected?.commitment !== "cancelled" && Number(v.expected?.remaining_amount) > 0).map(v => <div key={v.expected_item_id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-medium">{data.travelers.find(p => p.employee_id === v.employee_id)?.employee_name} · {money(v.expected?.remaining_amount ?? "0", v.currency)}</p><p className={quiet}>{t(v.direction === "outgoing" ? "toReimburse" : "toReturn")}</p></div><div className="flex gap-3"><Link className={link} href={`/finance/movements?expected=${v.expected_item_id}`}>{t(v.direction === "outgoing" ? "reimburse" : "recordReturn")}</Link><Link className={link} href={`/finance/expected?item=${v.expected_item_id}`}>{t("match")}</Link></div></div>)}</div>{!unusedAdvances.length && !data.balances.some(v => v.expected?.commitment !== "cancelled" && Number(v.expected?.remaining_amount) > 0) ? <p className={`mt-4 ${quiet}`}>{t("nothingDue")}</p> : null}{unusedAdvances.map(v => <div key={`${v.employee}-${v.currency}`} className="mt-3 text-sm"><p>{v.employee} · {money(v.amount,v.currency)}</p><p className={quiet}>{t("advanceToReconcile")}</p></div>)}<p className={`mt-4 ${quiet}`}>{t("balanceHelp")}</p>{unusedAdvances.length ? <p className={`mt-2 ${quiet}`}>{t("completeHelp")}</p> : null}</section></div>
    <section className={`${panel} p-4 sm:p-5`}><h2 className="font-semibold">{t("breakdown")}</h2><div className="mt-4 space-y-3">{tripExpenseTypes.map(type => {
      const amount = sum(data.entries.filter(e => e.kind === "expense" && e.expense_type === type));
      const width = Math.max(0, Math.min(100, Number(amount) / Math.max(1, Number(data.trip.actual_amount)) * 100));
      return <div key={type} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 text-sm"><span>{t(`types.${type}`)}</span><span className="tabular-nums">{money(amount)}</span>{canChartFinanceAmount(amount, base.minor_units) && canChartFinanceAmount(data.trip.actual_amount ?? "0", base.minor_units) ? <div className="col-span-2 h-1 rounded bg-[var(--ui-surface-muted)]" aria-hidden="true"><div className="h-full rounded bg-[var(--ui-border-strong)]" style={{ width: `${width}%` }}/></div> : null}</div>;
    })}</div></section>
    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] p-4"><div className="flex flex-wrap gap-1" role="group" aria-label={t("history")} >{["expense", "plan", "advance"].map(v => <Button key={v} variant={tab === v ? "outline" : "ghost"} size="sm" aria-pressed={tab === v} onClick={() => setTab(v)}>{t(`entries.${v}`)}</Button>)}</div>{data.trip.status !== "cancelled" ? <Button size="sm" variant="outline" onClick={() => setEditor("plan")}>{t("addPlan")}</Button> : null}</div>
      <div className="divide-y divide-[var(--ui-border)]">{data.entries.filter(e => e.kind === tab).map(e => <div key={e.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row"><div><p className="text-sm font-medium">{e.label || t(`types.${e.expense_type}`)}{e.reverses_id ? ` · ${t("correction")}` : ""}</p><p className={`mt-1 ${quiet}`}>{formatDateOnly(e.financial_date ?? "", locale)} · {e.employee_id ? data.travelers.find(v => v.employee_id === e.employee_id)?.employee_name : t(e.kind === "plan" ? "plan" : "studioAccount")}</p>{e.note ? <p className={`mt-1 ${quiet}`}>{e.note}</p> : null}{e.day_count ? <p className={`mt-1 ${quiet}`}>{e.daily_rate} × {e.day_count} {t("days")}</p> : null}<div className="flex flex-wrap gap-3">{e.movement_id ? <Link className={link} href="/finance/movements">{t("ledger")}</Link> : null}{e.expected_item_id ? <Link className={link} href={`/finance/expected?item=${e.expected_item_id}`}>{t("settlementHistory")}</Link> : null}{!e.movement_id && !e.reverses_id && !data.entries.some(v => v.reverses_id === e.id || v.plan_id === e.id) ? <button className={link} onClick={() => setCorrection(e)}>{t("correct")}</button> : null}</div></div><div className="text-sm tabular-nums sm:text-right"><p className="font-medium">{money(e.amount, e.currency ?? base.code)}</p>{e.currency !== base.code ? <p className={`mt-1 ${quiet}`}>{money(e.reporting_amount)} · {e.fx_source}</p> : null}{e.net_amount !== e.amount && Number(e.net_amount) !== Number(e.amount) ? <p className={quiet}>{t("netCost")} {money(e.net_amount, e.currency ?? base.code)}</p> : null}</div></div>)}</div>{!data.entries.some(e => e.kind === tab) ? <p className={`p-5 ${quiet}`}>{t("noEntries")}</p> : null}
    </section>
    {data.balances.length ? <details className={`${panel} p-4`}><summary className="cursor-pointer text-sm font-medium">{t("settlementHistory")}</summary><div className="mt-3 flex flex-wrap gap-x-5">{data.balances.map(v => <Link key={v.expected_item_id} className={link} href={`/finance/expected?item=${v.expected_item_id}`}>{data.travelers.find(p => p.employee_id === v.employee_id)?.employee_name} · {v.currency} · {t(v.direction === "outgoing" ? "toReimburse" : "toReturn")}</Link>)}</div></details> : null}
    <Dialog isOpen={Boolean(editor)} onRequestClose={() => { if (!pending) setEditor(null); }} closeDisabled={pending} closeLabel={f("close")} title={editor === "trip" ? f("edit") : t(editor === "plan" ? "addPlan" : editor === "advance" ? "issueAdvance" : "addExpense")} className="sm:max-w-xl">{editor === "trip" ? <TripForm options={options} detail={data} today={today} onPending={setPending} onSaved={saved}/> : editor ? <EntryForm key={editor} kind={editor} data={data} foundation={foundation} today={today} onPending={setPending} onSaved={saved}/> : null}</Dialog>
    <Dialog isOpen={Boolean(correction)} onRequestClose={() => { if (!pending) setCorrection(null); }} closeDisabled={pending} closeLabel={f("close")} title={t("correct")} className="sm:max-w-lg">{correction ? <FinanceActionForm className="space-y-4 p-4 sm:p-6" action={saveFinanceTrip} onSaved={saved} onPending={setPending} label={t("confirmCorrection")}><input type="hidden" name="intent" value="correct"/><input type="hidden" name="tripId" value={data.trip.id ?? ""}/><input type="hidden" name="reversesId" value={correction.id ?? ""}/><p className={quiet}>{t("correctionHelp")}</p><FormField label={t("reason")}><Textarea name="note" required maxLength={2000}/></FormField></FinanceActionForm> : null}</Dialog>
  </div>;
}
