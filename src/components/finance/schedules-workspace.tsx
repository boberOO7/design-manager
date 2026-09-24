"use client";
import Link from "next/link";
import { ChevronDown, Pencil, Plus, CircleStop, Gift, FolderInput, ArrowUp, ArrowDown } from "lucide-react";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceSchedule, saveFinanceGroup, moveFinanceRules } from "@/app/(app)/finance/schedules/actions";
import type { FinanceSchedulesData, getFinanceData } from "@/data/queries/finance";
import { Button } from "@/components/ui/button";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { BinarySwitch } from "@/components/ui/binary-switch";
import { PayrollSetup, initialPayrollMembers } from "./payroll-setup";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";
import { FinanceCategorySelect } from "./category-select";
import { formatFinanceAmount } from "@/lib/finance";
import { payrollCompensationSummary } from "@/lib/finance-schedules";
import { financeCategoryLabel } from "@/lib/finance-planning";
import { formatDateOnly } from "@/lib/utils";

type Data = NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & FinanceSchedulesData & { today: string };
type Schedule = FinanceSchedulesData["schedules"][number];
type Terms = FinanceSchedulesData["terms"][number];
type PaymentEditor = { intent: "schedule"; kind: "payroll" | "recurring"; schedule?: Schedule; groupId?: string } | { intent: "stop"; schedule: Schedule } | { intent: "bonus"; employeeId?: string };
type Editor = PaymentEditor | { intent: "setup" } | { intent: "group"; group?: Data["groups"][number] } | { intent: "move"; scheduleIds: string[]; groupId: string };
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";

function DateField({ name, label, initial, required = false }: { name: string; label: string; initial: string; required?: boolean }) {
  const [value, setValue] = useState(initial);
  const locale = useLocale();
  return <FormField label={label}><DatePicker name={name} aria-label={label} value={value} onValueChange={setValue} locale={locale} required={required} /></FormField>;
}

function monthEnd(month: string) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) return "";
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function formatEditableAmount(value: string) {
  const [integer, ...fraction] = value.split(/([.,])/);
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${fraction.join("")}`;
}

function GroupField({ groups, value, onChange, name = "groupId" }: { groups: Data["groups"]; value: string; onChange: (value: string) => void; name?: string }) {
  const t = useTranslations("Finance");
  return <FormField label={t("schedules.group")}><Select name={name} aria-label={t("schedules.group")} value={value} onValueChange={onChange}><SelectItem value="">{t("schedules.ungrouped")}</SelectItem>{groups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</Select></FormField>;
}

function MoveRuleForm({ data, scheduleIds, initialGroupId, onMoved, onSaved, onPending }: { data: Data; scheduleIds: string[]; initialGroupId: string; onMoved: (ids: string[]) => void; onSaved: () => void; onPending: (pending: boolean) => void }) {
  const t = useTranslations("Finance"), [groupId, setGroupId] = useState(initialGroupId);
  const [remaining, setRemaining] = useState(scheduleIds), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <form className="space-y-4" onSubmit={(event) => {
    event.preventDefault(); onPending(true);
    startTransition(async () => {
      try {
        const result = await moveFinanceRules({ groupId, scheduleIds: remaining });
        onMoved(result.moved); setRemaining((ids) => ids.filter((id) => !result.moved.includes(id))); setError(result.error);
        if (!result.error) onSaved();
      } catch { setError(t("schedules.moveRetry")); }
      finally { onPending(false); }
    });
  }}>
    <p role="status" className="text-sm text-[var(--ui-text-secondary)]">{t("schedules.selectedCount", { count: remaining.length })}</p>
    <fieldset disabled={pending || remaining.length < scheduleIds.length}><GroupField groups={data.groups} value={groupId} onChange={setGroupId} /></fieldset>
    {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onSaved}>{t("planning.cancel")}</Button><Button type="submit" disabled={pending}>{t(pending ? "movements.saving" : "planning.save")}</Button></div>
  </form>;
}

function ScheduleForm({ data, editor, onSaved, onPending }: { data: Data; editor: PaymentEditor; onSaved: () => void; onPending: (value: boolean) => void }) {
  const t = useTranslations("Finance"), locale = useLocale();
  const schedule = "schedule" in editor ? editor.schedule : undefined;
  const current = data.terms.find((term) => term.schedule_id === schedule?.id);
  const payroll = editor.intent === "schedule" && editor.kind === "payroll";
  const [employee, setEmployee] = useState(schedule?.employee_id ?? (editor.intent === "bonus" ? editor.employeeId : "") ?? "");
  const [currency, setCurrency] = useState(current?.currency ?? data.settings?.base_currency ?? "UAH");
  const [basis, setBasis] = useState<"net" | "gross">(current?.basis === "gross" ? "gross" : "net");
  const [costStatus, setCostStatus] = useState(current?.employer_cost_status ?? "fixed");
  const [amount, setAmount] = useState(current?.amount?.toString() ?? "");
  const [employeeDeductions, setEmployeeDeductions] = useState(current?.employee_deductions?.toString() ?? "");
  const [employerCost, setEmployerCost] = useState(current ? current.employer_cost?.toString() ?? "" : "0");
  const [interval, setInterval] = useState(String(current?.interval_months ?? 1));
  const [offset, setOffset] = useState(String(current?.payment_month_offset ?? (payroll ? 1 : 0)));
  const [certainty, setCertainty] = useState(current?.certainty ?? "fixed");
  const [owner, setOwner] = useState(data.categories.find((c) => c.id === current?.category_id)?.nature === "owner_distribution");
  const [groupId, setGroupId] = useState(schedule?.group_id ?? (editor.intent === "schedule" ? editor.groupId : "") ?? "");
  const [category, setCategory] = useState(current?.category_id ?? "");
  const [payoutDay, setPayoutDay] = useState(String(current?.payout_day ?? 1));
  const month = `${data.today.slice(0, 7)}-01`;
  const next = new Date(`${month}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  const [effectiveFromMonth, setEffectiveFromMonth] = useState((schedule ? nextMonth : month).slice(0, 7));
  const [effectiveThroughMonth, setEffectiveThroughMonth] = useState(current?.effective_through?.slice(0, 7) ?? "");
  const salaryCategory = data.categories.find((c) => c.default_key === "salary" && !c.archived_at);
  const payrollSummary = payrollCompensationSummary(amount, basis, employeeDeductions, employerCost);
  const payrollCurrency = data.currencies.find((item) => item.code === currency);
  const chooseEmployee = <FormField label={t("schedules.employee")}><Select name="employeeId" aria-label={t("schedules.employee")} value={employee} onValueChange={(value) => {
    setEmployee(value);
    const joinedAt = data.members.find((member) => member.user_id === value)?.joined_at;
    if (payroll && !schedule && joinedAt) {
      setEffectiveFromMonth(joinedAt.slice(0, 7));
      setPayoutDay(String(Number(joinedAt.slice(8, 10))));
    }
  }} required>
    {data.members.filter((m) => editor.intent === "bonus" || (m.is_active && m.profile.is_active)).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.profile.full_name}{!m.is_active ? ` · ${t("schedules.former")}` : ""}</SelectItem>)}
  </Select></FormField>;
  const currencyField = <FormField label={t("planning.currency")}><FinanceCurrencySelect name="currency" aria-label={t("planning.currency")} currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={currency} onValueChange={setCurrency} /></FormField>;
  const paymentTiming = <fieldset className="sm:col-span-2 lg:col-span-3"><legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("schedules.payoutTiming")}</legend><div className="flex min-h-11 flex-wrap items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] px-3 py-2 text-sm text-[var(--ui-text-secondary)]"><span>{t("schedules.payoutSentencePrefix")}</span><Input aria-label={t("schedules.payoutDay")} className="ui-numeric w-16 bg-[var(--ui-surface)] text-center" name="payoutDay" autoComplete="off" type="number" min={1} max={31} value={payoutDay} onChange={(event) => setPayoutDay(event.target.value)} required /><span>{t("schedules.payoutSentenceJoiner")}</span><Select width="content" aria-label={t("schedules.paymentMonth")} value={offset} onValueChange={setOffset} name="paymentMonthOffset"><SelectItem value="0">{t(payroll ? "schedules.payoutCurrentMonth" : "schedules.sameMonth")}</SelectItem><SelectItem value="1">{t("schedules.payoutNextMonth")}</SelectItem></Select></div></fieldset>;
  const effectivePeriod = <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3"><FormField label={t("schedules.effectiveFrom")}><input type="hidden" name="effectiveFrom" value={effectiveFromMonth ? `${effectiveFromMonth}-01` : ""} /><DatePicker aria-label={t("schedules.effectiveFrom")} monthOnly min={schedule ? payroll ? month : nextMonth : undefined} value={effectiveFromMonth ? `${effectiveFromMonth}-01` : ""} onValueChange={(value) => setEffectiveFromMonth(value.slice(0, 7))} locale={locale} required /></FormField><FormField label={t("schedules.effectiveThrough")}><input type="hidden" name="effectiveThrough" value={monthEnd(effectiveThroughMonth)} /><DatePicker aria-label={t("schedules.endDate")} monthOnly min={effectiveFromMonth ? `${effectiveFromMonth}-01` : undefined} value={effectiveThroughMonth ? `${effectiveThroughMonth}-01` : ""} onValueChange={(value) => setEffectiveThroughMonth(value.slice(0, 7))} locale={locale} /></FormField></div>;
  return <FinanceActionForm action={saveFinanceSchedule} label={t(editor.intent === "stop" ? "schedules.stop" : "planning.save")} onCancel={onSaved} cancelLabel={t("planning.cancel")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value={editor.intent} />
    {editor.intent === "stop" ? <>
      <input type="hidden" name="scheduleId" value={editor.schedule.id} />
      <p className="text-sm text-[var(--ui-text-secondary)]">{t("schedules.stopHelp")}</p>
      <input type="hidden" name="from" value={effectiveFromMonth ? `${effectiveFromMonth}-01` : ""} /><FormField label={t("schedules.stopFrom")}><DatePicker aria-label={t("schedules.stopFrom")} monthOnly min={nextMonth} value={effectiveFromMonth ? `${effectiveFromMonth}-01` : ""} onValueChange={(value) => setEffectiveFromMonth(value.slice(0, 7))} locale={locale} required /></FormField>
    </> : editor.intent === "bonus" ? <>
      <p className="text-sm text-[var(--ui-text-secondary)]">{t("schedules.bonusHelp")}</p>
      {chooseEmployee}
      <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
        <FormField label={t("movements.amount")}><Input name="amount" inputMode="decimal" required /></FormField>{currencyField}
      </div>
      <DateField name="dueDate" label={t("planning.dueDate")} initial={data.today} required />
      <fieldset><legend className="mb-2 text-sm font-medium text-[var(--ui-text-secondary)]">{t("schedules.period")}</legend><div className="grid gap-4 sm:grid-cols-2">
        <DateField name="periodStart" label={t("schedules.periodStart")} initial={month} required />
        <DateField name="periodEnd" label={t("schedules.periodEnd")} initial={data.today} required />
      </div></fieldset>
      <AnimatedDisclosure title={t("schedules.note")}><Textarea aria-label={t("movements.description")} name="description" rows={2} maxLength={2000} /></AnimatedDisclosure>
    </> : <>
      <input type="hidden" name="id" value={schedule?.id ?? ""} /><input type="hidden" name="revision" value={current?.revision ?? 0} /><input type="hidden" name="kind" value={editor.kind} />
      {schedule ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("schedules.revisionDateHelp")}</p> : null}
      {payroll ? <>
        <input type="hidden" name="name" value={current?.name ?? "Base salary"} />
        {schedule ? <FormField as="div" label={t("schedules.employee")}><input type="hidden" name="employeeId" value={employee} /><div className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] px-3 text-sm font-medium text-[var(--ui-text)]">{data.members.find((m) => m.user_id === employee)?.profile.full_name}</div></FormField> : chooseEmployee}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_8rem_minmax(15rem,1fr)] lg:items-end">
          <FormField label={t("schedules.agreedAmount")}><input type="hidden" name="amount" value={amount} /><Input aria-label={t("schedules.agreedAmount")} value={formatEditableAmount(amount)} onChange={(event) => setAmount(event.target.value.replace(/\s/g, ""))} inputMode="decimal" required /></FormField>{currencyField}
          <div className="motion-reduce:[&_*]:transition-none"><BinarySwitch emptyLabel={t("schedules.net")} label={t("schedules.basis")} value={basis} options={["net", "gross"] as const} optionLabel={(value) => t(`schedules.${value}`)} onChange={setBasis} /><input type="hidden" name="basis" value={basis} /></div>
          <AnimatedDisclosure className="sm:col-span-2 lg:col-span-3" title={t("schedules.payrollCosts")}><div className="mt-2 space-y-3">
            <p className="text-xs text-[var(--ui-text-muted)]">{t("schedules.compensationBasisHelp")}</p>
            <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("schedules.employeeTaxes")}><Input name="employeeDeductions" value={employeeDeductions} onChange={(event) => setEmployeeDeductions(event.target.value)} inputMode="decimal" required={basis === "gross"} /></FormField>
              <div className="space-y-2"><FormField label={t("schedules.employerContributions")}><Input name="employerCost" value={employerCost} onChange={(event) => setEmployerCost(event.target.value)} inputMode="decimal" disabled={costStatus === "unknown"} required={costStatus !== "unknown"} /></FormField><label className="flex min-h-9 items-center gap-2 text-xs text-[var(--ui-text-muted)]"><input type="checkbox" className="size-4" checked={costStatus === "unknown"} onChange={event => { setCostStatus(event.target.checked ? "unknown" : "fixed"); setEmployerCost(event.target.checked ? "" : "0"); }} />{t("schedules.costUnknown")}</label>{costStatus !== "unknown" && employerCost.trim() ? <FormField label={t("schedules.certainty")}><Select aria-label={t("schedules.certainty")} value={costStatus === "estimated" ? "estimated" : "fixed"} onValueChange={setCostStatus}>{["fixed", "estimated"].map((value) => <SelectItem key={value} value={value}>{t(`schedules.${value}`)}</SelectItem>)}</Select></FormField> : null}</div>
            </div>
            <p className="text-xs text-[var(--ui-text-muted)]">{t("schedules.compensationUnknownHelp")}</p>
            <input type="hidden" name="employeePayout" value={payrollSummary.employeeReceives ?? ""} />
            <input type="hidden" name="employerCostStatus" value={costStatus} />
            {payrollSummary.employeeReceives !== null || payrollSummary.studioCost !== null ? <dl className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--ui-border-subtle)] pt-2 text-xs">{payrollSummary.employeeReceives !== null ? <div><dt className="inline text-[var(--ui-text-muted)]">{t("schedules.employeeReceives")}</dt><dd className="ml-1 inline font-medium text-[var(--ui-text)]">{payrollCurrency ? formatFinanceAmount(payrollSummary.employeeReceives, payrollCurrency, locale) : `${payrollSummary.employeeReceives} ${currency}`}</dd></div> : null}{payrollSummary.studioCost !== null ? <div><dt className="inline text-[var(--ui-text-muted)]">{t("schedules.studioCostSummary")}</dt><dd className="ml-1 inline font-medium text-[var(--ui-text)]">{payrollCurrency ? formatFinanceAmount(payrollSummary.studioCost, payrollCurrency, locale) : `${payrollSummary.studioCost} ${currency}`}</dd></div> : null}</dl> : null}
          </div></AnimatedDisclosure>
          {paymentTiming}
          {effectivePeriod}
        </div>
        <AnimatedDisclosure title={t("schedules.note")}><Textarea aria-label={t("schedules.note")} name="reason" rows={2} maxLength={2000} /></AnimatedDisclosure>
        <input type="hidden" name="categoryId" value={salaryCategory?.id ?? ""} /><input type="hidden" name="intervalMonths" value="1" /><input type="hidden" name="commitment" value="agreed" /><input type="hidden" name="certainty" value="fixed" />
      </> : <>
        <GroupField groups={data.groups} value={groupId} onChange={setGroupId} />
        <FormField label={t("schedules.name")} optional optionalLabel={t("schedules.optional")}><Input name="name" autoComplete="off" defaultValue={current?.name ?? ""} maxLength={120} /></FormField>
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
          <FormField as="div" label={t("movements.amount")}><div className="relative"><Input className="pr-32" name="amount" autoComplete="off" defaultValue={current?.amount ?? ""} inputMode="decimal" required /><label className="absolute right-1 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1.5 rounded-md bg-[var(--ui-surface-muted)] px-2 py-1 text-xs text-[var(--ui-text-secondary)]"><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)]" checked={certainty === "estimated"} onChange={(event) => setCertainty(event.target.checked ? "estimated" : "fixed")} />≈ {t("schedules.estimated")}</label></div></FormField>{currencyField}
        </div>
        <input type="hidden" name="certainty" value={certainty} /><input type="hidden" name="employerCostStatus" value="unknown" />
        <div className="grid gap-4 sm:grid-cols-2"><div>
          <FinanceCategorySelect categories={data.categories} direction="outgoing" owner={owner} value={category} onValueChange={setCategory} currentId={current?.category_id} />
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)]" checked={owner} onChange={(event) => { setOwner(event.target.checked); setCategory(""); }} />{t("movements.kinds.owner_withdrawal")}</label>
          <AnimatedFormContent isOpen={Boolean(owner)}><p className="text-xs text-[var(--ui-text-muted)]">{t("movements.ownerHelp")}</p></AnimatedFormContent>
        </div>
          <FormField label={t("schedules.recurrence")}><Select name="intervalMonths" aria-label={t("schedules.recurrence")} value={interval} onValueChange={setInterval}>{["1", "3", "12"].map((v) => <SelectItem key={v} value={v}>{t(`schedules.intervals.${v}`)}</SelectItem>)}</Select></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {paymentTiming}
          {effectivePeriod}
        </div>
        <input type="hidden" name="commitment" value={current?.commitment ?? "agreed"} />
        <AnimatedDisclosure title={t("schedules.note")}><Textarea aria-label={t("project.reason")} name="reason" autoComplete="off" rows={2} maxLength={2000} /></AnimatedDisclosure>
      </>}
    </>}
  </FinanceActionForm>;
}

export function FinanceSchedulesWorkspace(data: Data) {
  const t = useTranslations("Finance"), locale = useLocale();
  const [editor, setEditor] = useState<Editor | null>(null), [pending, setPending] = useState(false);
  const monthLabel = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", ...(locale === "uk" ? { day: "numeric" } as const : {}), timeZone: "UTC" }).formatToParts(new Date(`${value}T00:00:00Z`)).filter((part) => part.type !== "day").map((part) => part.value).join("").trim() : t("schedules.openEnded");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [groupError, setGroupError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const selectRule = (id: string) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  const date = (value: string | null) => value ? formatDateOnly(value, locale) : t("schedules.openEnded");
  const money = (amount: number | null, currency: string | null) => {
    if (amount === null) return t("schedules.unknown");
    const code = data.currencies.find((c) => c.code === currency);
    return code ? formatFinanceAmount(amount, code, locale) : `${amount} ${currency}`;
  };
  const revisionPeriod = (term: Terms) => {
    if (!term.effective_from || !term.valid_through) return `${date(term.effective_from)} – ${date(term.valid_through)}`;
    const start = new Date(`${term.effective_from}T00:00:00Z`), end = new Date(`${term.valid_through}T00:00:00Z`);
    const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
    const withYear = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return start.getUTCFullYear() === end.getUTCFullYear() ? `${short.format(start)} – ${withYear.format(end)}` : `${withYear.format(start)} – ${withYear.format(end)}`;
  };
  function termSummary(term: Terms) {
    const period = term.valid_through && term.effective_from && term.valid_through < term.effective_from
      ? t("schedules.neverEffective", { date: date(term.effective_from) })
      : `${date(term.effective_from)} – ${date(term.valid_through)}`;
    const timing = `${t("schedules.payoutSentencePrefix")} ${term.payout_day} ${t("schedules.payoutSentenceJoiner")} ${t(term.payment_month_offset === 1 ? "schedules.payoutNextMonth" : "schedules.payoutCurrentMonth")}`;
    return <dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {[[t("schedules.agreementPeriod"), period], [t("movements.amount"), `${term.certainty === "estimated" ? "≈ " : ""}${money(term.amount, term.currency)} · ${t(`schedules.intervals.${term.interval_months}`)}`], [t("schedules.payoutTiming"), timing]].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-0.5 tabular-nums text-[var(--ui-text)]">{value}</dd></div>)}
      {termReason(term.reason) ? <div className="sm:col-span-2 lg:col-span-4"><dt className="text-xs text-[var(--ui-text-muted)]">{t("schedules.note")}</dt><dd className="mt-0.5 break-words text-[var(--ui-text)]">{termReason(term.reason)}</dd></div> : null}
    </dl>;
  }
  const termReason = (reason: string | null) => !reason || ["Compensation agreement", "Домовленість про оплату праці", "Compensation revision", "Нова редакція оплати праці", "Recurring payment agreement", "Домовленість про регулярний платіж"].includes(reason) ? "" : reason;
  function payrollTermDetails(term: Terms) {
    const period = term.valid_through && term.effective_from && term.valid_through < term.effective_from
      ? t("schedules.neverEffective", { date: date(term.effective_from) })
      : `${date(term.effective_from)} – ${date(term.valid_through)}`;
    const employerCost = `${money(term.employer_cost, term.currency)}${term.employer_cost_status !== "unknown" ? ` · ${t(`schedules.${term.employer_cost_status}`)}` : ""}`;
    const note = termReason(term.reason);
    return <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-3">
      {[[t("schedules.agreementPeriod"), period], [t("schedules.deductions"), money(term.employee_deductions, term.currency)], [t("schedules.employerCost"), employerCost]].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-0.5 tabular-nums text-sm text-[var(--ui-text)]">{value}</dd></div>)}
      {note ? <div className="sm:col-span-3"><dt className="text-xs text-[var(--ui-text-muted)]">{t("schedules.note")}</dt><dd className="mt-0.5 break-words text-sm text-[var(--ui-text)]">{note}</dd></div> : null}
    </dl>;
  }
  const toggle = (id: string) => setExpanded((rows) => rows.includes(id) ? rows.filter((row) => row !== id) : [...rows, id]);
  const quietActions = "flex gap-1 opacity-100 transition-opacity motion-reduce:transition-none lg:pointer-fine:opacity-0 lg:pointer-fine:group-hover:opacity-100 lg:pointer-fine:group-has-[:focus-visible]:opacity-100";
  function ruleRow(schedule: Schedule) {
    const history = data.terms.filter((term) => term.schedule_id === schedule.id);
    const latest = history.find((term) => !term.valid_through || !term.effective_from || term.valid_through >= term.effective_from) ?? history[0];
    const current = history.find((term) => term.effective_from && term.effective_from <= data.today && (!term.valid_through || term.valid_through >= data.today)) ?? latest;
    if (!current) return null;
    const payroll = schedule.kind === "payroll", open = expanded.includes(schedule.id);
    const activeToday = Boolean(current.effective_from && current.effective_from <= data.today && (!current.valid_through || current.valid_through >= data.today) && (!schedule.stopped_from || schedule.stopped_from > data.today));
    const revisions = history.filter((term) => term.id !== current.id);
    const category = data.categories.find((item) => item.id === current.category_id);
    const groupName = data.groups.find((item) => item.id === schedule.group_id)?.name;
    const storedName = current.name ?? "";
    const defaultCategoryName = category?.name ?? "";
    const categoryDisplay = financeCategoryLabel(category, storedName, (key) => t(`planning.defaults.${key}`));
    const generatedNames = [defaultCategoryName, [defaultCategoryName, groupName].filter(Boolean).join(" · ")];
    const name = payroll ? data.members.find((member) => member.user_id === schedule.employee_id)?.profile.full_name ?? storedName : generatedNames.includes(storedName) ? categoryDisplay : storedName;
    const owner = category?.nature === "owner_distribution";
    return <article key={schedule.id} role={payroll ? undefined : "button"} tabIndex={payroll ? undefined : 0} aria-label={payroll ? undefined : `${name} · ${t("schedules.history")}`} aria-expanded={payroll ? undefined : open} aria-controls={payroll ? undefined : `rule-details-${schedule.id}`} data-selected={selected.includes(schedule.id) || undefined} onClick={(event) => {
      if (payroll || !(event.target instanceof Element) || event.target.closest("button, a, input, label, select, textarea, details, summary, [id^='rule-details-']")) return;
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); selectRule(schedule.id); return; }
      toggle(schedule.id);
    }} onKeyDown={(event) => {
      if (payroll || event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault(); toggle(schedule.id);
    }} className="group px-4 py-2 data-selected:bg-[var(--ui-surface-subtle)] data-selected:ring-1 data-selected:ring-inset data-selected:ring-[var(--ui-border-strong)] transition-colors motion-reduce:transition-none hover:bg-[var(--ui-surface-subtle)] has-[:focus-visible]:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:px-5">
      {payroll ? <div className="grid items-start gap-x-4 gap-y-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_12rem]"><div role="button" tabIndex={0} id={`rule-history-${schedule.id}`} aria-label={`${name} · ${t("schedules.history")}`} aria-expanded={open} aria-controls={`rule-details-${schedule.id}`} onClick={() => toggle(schedule.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(schedule.id); } }} className="block min-w-0 cursor-pointer rounded-[var(--ui-radius-control)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] lg:col-span-3"><div className="grid min-h-11 items-center gap-x-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)]"><h3 className="min-w-0 break-words text-sm font-semibold">{name}</h3><p className="text-sm font-medium tabular-nums">{current.certainty === "estimated" ? "≈ " : ""}{money(current.amount, current.currency)}<span className="font-normal text-[var(--ui-text-secondary)]">{` / ${t("schedules.perMonth")} · ${t(`schedules.${current.basis}`)}`}</span></p><div className="text-sm text-[var(--ui-text-secondary)]"><p>{t(current.payment_month_offset === 1 ? "schedules.payoutNext" : "schedules.payoutCurrent", { day: current.payout_day ?? 1 })}</p></div></div><div className="space-y-1 text-xs text-[var(--ui-text-muted)]">{current.effective_through ? <p>{t("schedules.validThroughMonth", { month: monthLabel(current.effective_through) })}</p> : null}{current.effective_from && current.effective_from > data.today ? <p>{t("schedules.validFromMonth", { month: monthLabel(current.effective_from) })}</p> : null}{latest && latest.id !== current.id && latest.effective_from && latest.effective_from > data.today ? <p>{t("schedules.upcomingChange", { amount: `${latest.certainty === "estimated" ? "≈ " : ""}${money(latest.amount, latest.currency)}`, month: monthLabel(latest.effective_from) })}</p> : null}{schedule.stopped_from ? <p>{t("schedules.stopped", { date: monthLabel(schedule.stopped_from) })}</p> : null}{current.commitment === "tentative" ? <p>{t("planning.agreementOptions.tentative")}</p> : null}</div></div><div className="flex h-11 w-48 items-center justify-end gap-1"><div className={quietActions}>{!schedule.stopped_from ? <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.revise")} title={t("schedules.revise")} onClick={() => setEditor({ intent: "schedule", kind: "payroll", schedule })}><Pencil className="size-4" aria-hidden="true" /></Button> : null}{!schedule.stopped_from && activeToday ? <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.addBonus")} title={t("schedules.addBonus")} onClick={() => setEditor({ intent: "bonus", employeeId: schedule.employee_id ?? undefined })}><Gift className="size-4" aria-hidden="true" /></Button> : null}{!schedule.stopped_from ? <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.stop")} title={t("schedules.stop")} onClick={() => setEditor({ intent: "stop", schedule })}><CircleStop className="size-4" aria-hidden="true" /></Button> : null}</div><span className="flex size-11 shrink-0 items-center justify-center text-[var(--ui-text-secondary)]"><ChevronDown className={`size-4 transition-transform duration-[220ms] [[data-motion=system]_&]:motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" /></span></div></div> : <><div className="grid items-center gap-x-4 gap-y-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_auto]"><h4 className="min-w-0 break-words text-sm font-semibold">{name}</h4><p className="text-sm font-medium tabular-nums">{current.certainty === "estimated" ? "≈ " : ""}{money(current.amount, current.currency)}<span className="font-normal text-[var(--ui-text-secondary)]">{` · ${t(`schedules.intervals.${current.interval_months}`)}`}</span></p><div className="text-sm text-[var(--ui-text-secondary)]">{schedule.nextPayment ? <Link className="underline decoration-[var(--ui-border-strong)] underline-offset-4" href={`/finance/expected?item=${schedule.nextPayment.id}&period=all`}>{t("schedules.nextExpected", { date: date(schedule.nextPayment.date) })}</Link> : <p>{t("schedules.noUpcoming")}</p>}</div><div className={quietActions}>{!schedule.stopped_from ? <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.revise")} title={t("schedules.revise")} onClick={() => setEditor({ intent: "schedule", kind: "recurring", schedule })}><Pencil className="size-4" aria-hidden="true" /></Button> : null}<Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.moveGroup")} title={t("schedules.moveGroup")} onClick={() => setEditor({ intent: "move", scheduleIds: [schedule.id], groupId: schedule.group_id ?? "" })}><FolderInput className="size-4" aria-hidden="true" /></Button>{!schedule.stopped_from ? <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.stop")} title={t("schedules.stop")} onClick={() => setEditor({ intent: "stop", schedule })}><CircleStop className="size-4" aria-hidden="true" /></Button> : null}<Button variant="ghost" className="size-11 p-0" id={`rule-history-${schedule.id}`} aria-label={t("schedules.history")} title={t("schedules.history")} aria-expanded={open} aria-controls={`rule-details-${schedule.id}`} onClick={() => toggle(schedule.id)}><ChevronDown className={`size-4 transition-transform duration-[220ms] [[data-motion=system]_&]:motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" /></Button></div></div><div className="space-y-1 text-xs text-[var(--ui-text-muted)]">{current.effective_through ? <p>{t("schedules.validThroughMonth", { month: monthLabel(current.effective_through) })}</p> : null}{current.effective_from && current.effective_from > data.today ? <p>{t("schedules.validFromMonth", { month: monthLabel(current.effective_from) })}</p> : null}{latest && latest.id !== current.id && latest.effective_from && latest.effective_from > data.today ? <p>{t("schedules.upcomingChange", { amount: `${latest.certainty === "estimated" ? "≈ " : ""}${money(latest.amount, latest.currency)}`, month: monthLabel(latest.effective_from) })}</p> : null}{schedule.stopped_from ? <p>{t("schedules.stopped", { date: monthLabel(schedule.stopped_from) })}</p> : null}{current.commitment === "tentative" ? <p>{t("planning.agreementOptions.tentative")}</p> : null}{owner ? <p>{t("movements.kinds.owner_withdrawal")} · {t("schedules.nonOperating")}</p> : null}</div></>}
      <AnimatedFormContent id={`rule-details-${schedule.id}`} labelledBy={`rule-history-${schedule.id}`} isOpen={open}><div className="mt-1.5 border-t border-[var(--ui-border-subtle)] pt-2">
        {payroll ? <><div>{payrollTermDetails(current)}</div>{revisions.length ? <details className="group/history mt-2 border-t border-[var(--ui-border-subtle)]"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span>{t("schedules.changeHistory", { count: revisions.length })}</span><ChevronDown className="size-4 shrink-0 transition-transform duration-[220ms] motion-reduce:transition-none group-open/history:rotate-180" aria-hidden="true" /></summary><ul className="divide-y divide-[var(--ui-border-subtle)] border-t border-[var(--ui-border-subtle)]">{revisions.map((term) => <li key={term.id} className="grid gap-x-5 gap-y-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><p className="text-[var(--ui-text-secondary)]">{revisionPeriod(term)}</p><p className="tabular-nums text-[var(--ui-text)]">{money(term.amount, term.currency)}<span className="text-[var(--ui-text-secondary)]"> · {t(`schedules.${term.basis}`)}</span></p></li>)}</ul></details> : null}</> : <><dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {[[t("schedules.agreementPeriod"), current.valid_through && current.effective_from && current.valid_through < current.effective_from ? t("schedules.neverEffective", { date: date(current.effective_from) }) : `${date(current.effective_from)} – ${date(current.valid_through)}`], [t("movements.category"), categoryDisplay], [t("schedules.payoutTiming"), `${t("schedules.payoutSentencePrefix")} ${current.payout_day} ${t("schedules.payoutSentenceJoiner")} ${t(current.payment_month_offset === 1 ? "schedules.payoutNextMonth" : "schedules.payoutCurrentMonth")}`]].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-0.5 text-sm text-[var(--ui-text)]">{value}</dd></div>)}
          {termReason(current.reason) ? <div className="sm:col-span-2 lg:col-span-4"><dt className="text-xs text-[var(--ui-text-muted)]">{t("schedules.note")}</dt><dd className="mt-0.5 break-words text-sm text-[var(--ui-text)]">{termReason(current.reason)}</dd></div> : null}
        </dl>{revisions.length ? <details className="group/history mt-2 border-t border-[var(--ui-border-subtle)]"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span>{t("schedules.changeHistory", { count: revisions.length })}</span><ChevronDown className="size-4 shrink-0 transition-transform duration-[220ms] motion-reduce:transition-none group-open/history:rotate-180" aria-hidden="true" /></summary><ul className="divide-y divide-[var(--ui-border-subtle)] border-t border-[var(--ui-border-subtle)]">{revisions.map((term) => <li key={term.id} className="py-2">{termSummary(term)}</li>)}</ul></details> : null}</>}
      </div></AnimatedFormContent>
    </article>;
  }
  async function reorder(id: string, operation: "up" | "down") {
    setPending(true); setGroupError("");
    const form = new FormData(); form.set("operation", operation); form.set("id", id); form.set("requestId", crypto.randomUUID());
    try { const result = await saveFinanceGroup({ status: "idle" }, form); if (result.status === "error") setGroupError(result.message ?? t("schedules.errors.group")); }
    catch { setGroupError(t("schedules.errors.group")); }
    finally { setPending(false); }
  }
  const payroll = data.schedules.filter((schedule) => schedule.kind === "payroll"), recurring = data.schedules.filter((schedule) => schedule.kind === "recurring");
  const groups = [...data.groups, ...(recurring.some((schedule) => !schedule.group_id) || !data.groups.length ? [{ id: "", name: t("schedules.ungrouped"), position: data.groups.length, studio_id: "" }] : [])];
  const ready = Boolean(data.settings?.finalized_at);
  const close = () => setEditor(null);
  return <div className="w-full min-w-0 space-y-6">
    <PageHeader title={t("schedules.title")} description={t("schedules.description")} />
    {!ready ? <p className={`${panel} p-5 text-sm`}>{t("movements.setupRequired")} <Link href="/finance/accounts" className="underline">{t("movements.setupLink")}</Link></p> : null}
    <section aria-labelledby="section-payroll" className={`${panel} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] px-4 py-3 sm:px-5"><h2 id="section-payroll" className="font-semibold">{t("schedules.payrollSection")}</h2>{ready ? <div className="flex flex-wrap gap-2"><Button className="gap-2" onClick={() => setEditor({ intent: "schedule", kind: "payroll" })}><Plus className="size-4" aria-hidden="true" />{t("schedules.addCompensation")}</Button>{initialPayrollMembers(data).length ? <Button variant="outline" onClick={() => setEditor({ intent: "setup" })}>{t("schedules.setupTeam")}</Button> : null}{!payroll.length ? <Button variant="ghost" onClick={() => setEditor({ intent: "bonus" })}>{t("schedules.addBonus")}</Button> : null}</div> : null}</div>
      {payroll.length ? <div className="hidden border-b border-[var(--ui-border)] px-5 py-2 text-xs font-medium text-[var(--ui-text-muted)] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_12rem] lg:gap-x-4"><span>{t("schedules.employee")}</span><span>{t("schedules.agreedAmount")}</span><span>{t("schedules.payoutTiming")}</span><span className="sr-only">{t("schedules.history")}</span></div> : null}
      <div className="divide-y divide-[var(--ui-border)]">{payroll.map(ruleRow)}{!payroll.length ? <p className="p-5 text-sm text-[var(--ui-text-muted)]">{t("schedules.payrollEmpty")}</p> : null}</div>
    </section>
    <section aria-labelledby="section-recurring" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="section-recurring" className="font-semibold">{t("schedules.recurringSection")}</h2>{ready ? <div className="flex flex-wrap gap-2"><Button className="gap-2" onClick={() => setEditor({ intent: "schedule", kind: "recurring" })}><Plus className="size-4" aria-hidden="true" />{t("schedules.addRecurring")}</Button><Button variant="outline" onClick={() => setEditor({ intent: "group" })}>{t("schedules.addGroup")}</Button></div> : null}</div>
      <AnimatedFormContent isOpen={selected.length > 0}><div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2"><span role="status" className="text-sm font-medium tabular-nums">{t("schedules.selectedCount", { count: selected.length })}</span><Button variant="outline" className="gap-2" onClick={() => setEditor({ intent: "move", scheduleIds: selected, groupId: "" })}><FolderInput className="size-4" aria-hidden="true" />{t("schedules.moveSelected")}</Button><Button variant="ghost" onClick={() => setSelected([])}>{t("schedules.clearSelection")}</Button></div></AnimatedFormContent>
      {groupError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{groupError}</p> : null}
      {groups.map((group, index) => {
        const rules = recurring.filter((schedule) => (schedule.group_id ?? "") === group.id);
        return <section key={group.id} aria-label={group.name} className={`${panel} overflow-hidden`}>
          <div className="group flex flex-wrap items-center justify-between gap-x-3 border-b border-[var(--ui-border)] px-4 py-2 sm:px-5"><h3 className="text-sm font-semibold">{group.name}<span className="ml-2 font-normal tabular-nums text-[var(--ui-text-muted)]">{rules.length}</span></h3>{ready ? <div className="flex items-center gap-1">
            {group.id ? <div className={quietActions}><Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.renameGroup")} title={t("schedules.renameGroup")} onClick={() => setEditor({ intent: "group", group })}><Pencil className="size-4" aria-hidden="true" /></Button><Button variant="ghost" className="size-11 p-0" disabled={pending || index === 0} aria-label={t("schedules.groupUp")} title={t("schedules.groupUp")} onClick={() => reorder(group.id, "up")}><ArrowUp className="size-4" aria-hidden="true" /></Button><Button variant="ghost" className="size-11 p-0" disabled={pending || index === data.groups.length - 1} aria-label={t("schedules.groupDown")} title={t("schedules.groupDown")} onClick={() => reorder(group.id, "down")}><ArrowDown className="size-4" aria-hidden="true" /></Button></div> : null}
            <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.addInGroup", { name: group.name })} title={t("schedules.addInGroup", { name: group.name })} onClick={() => setEditor({ intent: "schedule", kind: "recurring", groupId: group.id })}><Plus className="size-4" aria-hidden="true" /></Button>
          </div> : null}</div>
          <div className="divide-y divide-[var(--ui-border)]">{rules.map(ruleRow)}{!rules.length ? <p className="px-5 py-4 text-sm text-[var(--ui-text-muted)]">{t("schedules.groupEmpty")}</p> : null}</div>
        </section>;
      })}
    </section>
    <Dialog className={editor?.intent === "setup" ? "h-auto max-h-[calc(100dvh-1rem)] sm:!max-w-[90rem]" : editor?.intent === "move" || editor?.intent === "group" ? "h-auto max-h-[calc(100dvh-1rem)] max-w-lg" : undefined} isOpen={editor !== null} closeDisabled={pending} onRequestClose={close} title={t(editor?.intent === "setup" ? "schedules.setupTeam" : editor?.intent === "group" ? editor.group ? "schedules.renameGroup" : "schedules.addGroup" : editor?.intent === "move" ? "schedules.moveGroup" : editor?.intent === "bonus" ? "schedules.addBonus" : editor?.intent === "stop" ? "schedules.stop" : editor?.schedule ? editor.kind === "payroll" ? "schedules.reviseCompensation" : "schedules.reviseRecurring" : editor?.kind === "payroll" ? "schedules.addCompensation" : "schedules.addRecurring")} closeLabel={t("movements.close")}>
      {editor ? <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">{editor.intent === "setup" ? <PayrollSetup data={data} onPending={setPending} onClose={close} /> : editor.intent === "move" ? <MoveRuleForm data={data} scheduleIds={editor.scheduleIds} initialGroupId={editor.groupId} onMoved={(ids) => setSelected((values) => values.filter((id) => !ids.includes(id)))} onSaved={close} onPending={setPending} /> : editor.intent === "group" ? <FinanceActionForm action={saveFinanceGroup} label={t("planning.save")} onSaved={close} onPending={setPending} onCancel={close} cancelLabel={t("planning.cancel")}><input type="hidden" name="operation" value={editor.group ? "rename" : "create"} /><input type="hidden" name="id" value={editor.group?.id ?? ""} /><FormField label={t("schedules.groupName")}><Input name="name" defaultValue={editor.group?.name ?? ""} maxLength={80} required /></FormField></FinanceActionForm> : <ScheduleForm data={data} editor={editor} onSaved={close} onPending={setPending} />}</div> : null}
    </Dialog>
  </div>;
}
