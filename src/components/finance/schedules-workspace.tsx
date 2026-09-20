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
import { formatDateOnly } from "@/lib/utils";

type Data = NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & FinanceSchedulesData & { today: string };
type Schedule = FinanceSchedulesData["schedules"][number];
type Terms = FinanceSchedulesData["terms"][number];
type PaymentEditor = { intent: "schedule"; kind: "payroll" | "recurring"; schedule?: Schedule; groupId?: string } | { intent: "stop"; schedule: Schedule } | { intent: "bonus"; employeeId?: string };
type Editor = PaymentEditor | { intent: "setup" } | { intent: "group"; group?: Data["groups"][number] } | { intent: "move"; scheduleIds: string[]; groupId: string };
type EmployerCostChoice = "unknown" | "none" | "has";
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
  const t = useTranslations("Finance");
  const schedule = "schedule" in editor ? editor.schedule : undefined;
  const current = data.terms.find((term) => term.schedule_id === schedule?.id);
  const payroll = editor.intent === "schedule" && editor.kind === "payroll";
  const [employee, setEmployee] = useState(schedule?.employee_id ?? (editor.intent === "bonus" ? editor.employeeId : "") ?? "");
  const [currency, setCurrency] = useState(current?.currency ?? data.settings?.base_currency ?? "UAH");
  const [basis, setBasis] = useState(current?.basis ?? "net");
  const [costsOpen, setCostsOpen] = useState(current?.basis === "gross" || current?.employee_deductions != null || (current?.employer_cost_status != null && current.employer_cost_status !== "unknown"));
  const [costStatus, setCostStatus] = useState(current?.employer_cost_status ?? "unknown");
  const [costChoice, setCostChoice] = useState<EmployerCostChoice>(current?.employer_cost_status === "unknown" || !current ? "unknown" : current.employer_cost_status === "fixed" && current.employer_cost === 0 ? "none" : "has");
  const [amount, setAmount] = useState(current?.amount?.toString() ?? "");
  const [employeePayout, setEmployeePayout] = useState(current?.employee_payout?.toString() ?? "");
  const [employeeDeductions, setEmployeeDeductions] = useState(current?.employee_deductions?.toString() ?? "");
  const [employerCost, setEmployerCost] = useState(current?.employer_cost?.toString() ?? "");
  const [hasEndDate, setHasEndDate] = useState(Boolean(current?.effective_through));
  const [interval, setInterval] = useState(String(current?.interval_months ?? 1));
  const [offset, setOffset] = useState(String(current?.payment_month_offset ?? (payroll ? 1 : 0)));
  const [commitment, setCommitment] = useState(current?.commitment ?? "agreed");
  const [certainty, setCertainty] = useState(current?.certainty ?? "fixed");
  const [owner, setOwner] = useState(data.categories.find((c) => c.id === current?.category_id)?.nature === "owner_distribution");
  const [groupId, setGroupId] = useState(schedule?.group_id ?? (editor.intent === "schedule" ? editor.groupId : "") ?? "");
  const [category, setCategory] = useState(current?.category_id ?? "");
  const month = `${data.today.slice(0, 7)}-01`;
  const next = new Date(`${month}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  const [effectiveFromMonth, setEffectiveFromMonth] = useState((schedule ? nextMonth : month).slice(0, 7));
  const [effectiveThroughMonth, setEffectiveThroughMonth] = useState(current?.effective_through?.slice(0, 7) ?? "");
  const salaryCategory = data.categories.find((c) => c.default_key === "salary" && !c.archived_at);
  const chooseEmployee = <FormField label={t("schedules.employee")}><Select name="employeeId" aria-label={t("schedules.employee")} value={employee} onValueChange={(value) => {
    setEmployee(value);
    const joinedAt = data.members.find((member) => member.user_id === value)?.joined_at;
    if (payroll && !schedule && joinedAt) setEffectiveFromMonth(joinedAt.slice(0, 7));
  }} required>
    {data.members.filter((m) => editor.intent === "bonus" || (m.is_active && m.profile.is_active)).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.profile.full_name}{!m.is_active ? ` · ${t("schedules.former")}` : ""}</SelectItem>)}
  </Select></FormField>;
  const currencyField = <FormField label={t("planning.currency")}><FinanceCurrencySelect name="currency" aria-label={t("planning.currency")} currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={currency} onValueChange={setCurrency} /></FormField>;
  const paymentTiming = <fieldset className="sm:col-span-2"><legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("schedules.payoutTiming")}</legend><div className="flex min-h-11 flex-wrap items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] px-3 py-2 text-sm text-[var(--ui-text-secondary)]"><span>{t("schedules.payoutSentencePrefix")}</span><Input aria-label={t("schedules.payoutDay")} className="ui-numeric w-16 bg-[var(--ui-surface)] text-center" name="payoutDay" type="number" min={1} max={31} defaultValue={current?.payout_day ?? 1} required /><span>{t("schedules.payoutSentenceJoiner")}</span><Select width="content" aria-label={t("schedules.paymentMonth")} value={offset} onValueChange={setOffset} name="paymentMonthOffset"><SelectItem value="0">{t(payroll ? "schedules.payoutCurrentMonth" : "schedules.sameMonth")}</SelectItem><SelectItem value="1">{t("schedules.payoutNextMonth")}</SelectItem></Select></div></fieldset>;
  const effectivePeriod = <><FormField label={t("schedules.effectiveFrom")}><input type="hidden" name="effectiveFrom" value={effectiveFromMonth ? `${effectiveFromMonth}-01` : ""} /><Input aria-label={t("schedules.effectiveFrom")} type="month" min={schedule ? nextMonth.slice(0, 7) : undefined} value={effectiveFromMonth} onChange={(event) => setEffectiveFromMonth(event.target.value)} required /></FormField>
          <div className="self-start"><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--ui-text-secondary)]"><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)]" checked={hasEndDate} onChange={(event) => setHasEndDate(event.target.checked)} />{t("schedules.hasEndDate")}</label><input type="hidden" name="effectiveThrough" value={hasEndDate ? monthEnd(effectiveThroughMonth) : ""} /><AnimatedFormContent isOpen={hasEndDate}><div className="pt-2"><FormField label={t("schedules.endDate")}><Input aria-label={t("schedules.endDate")} type="month" disabled={!hasEndDate} min={effectiveFromMonth} value={effectiveThroughMonth} onChange={(event) => setEffectiveThroughMonth(event.target.value)} required={hasEndDate} /></FormField></div></AnimatedFormContent></div></>;
  return <FinanceActionForm action={saveFinanceSchedule} label={t(editor.intent === "stop" ? "schedules.stop" : "planning.save")} onCancel={onSaved} cancelLabel={t("planning.cancel")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value={editor.intent} />
    {editor.intent === "stop" ? <>
      <input type="hidden" name="scheduleId" value={editor.schedule.id} />
      <p className="text-sm text-[var(--ui-text-secondary)]">{t("schedules.stopHelp")}</p>
      <input type="hidden" name="from" value={effectiveFromMonth ? `${effectiveFromMonth}-01` : ""} /><FormField label={t("schedules.stopFrom")}><Input type="month" min={nextMonth.slice(0, 7)} value={effectiveFromMonth} onChange={(event) => setEffectiveFromMonth(event.target.value)} required /></FormField>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3 sm:col-span-2"><FormField label={t("schedules.agreedAmount")}><Input name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required /></FormField>{currencyField}</div>
          <div className="sm:col-span-2 motion-reduce:[&_*]:transition-none"><BinarySwitch emptyLabel={t("schedules.net")} label={t("schedules.basis")} value={basis} options={["net", "gross"] as const} optionLabel={(value) => t(`schedules.${value}`)} onChange={(value) => { setBasis(value); if (value === "gross") setCostsOpen(true); }} /><input type="hidden" name="basis" value={basis} /></div>
          <AnimatedDisclosure className="sm:col-span-2" title={t("schedules.payrollCosts")} open={costsOpen} onOpenChange={setCostsOpen}><div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><AnimatedFormContent isOpen><div className="grid gap-4 sm:grid-cols-2">{basis === "gross" ? <>
            <FormField label={t("schedules.deductions")}><Input name="employeeDeductions" value={employeeDeductions} onChange={(event) => setEmployeeDeductions(event.target.value)} inputMode="decimal" required /></FormField>
            <FormField label={t("schedules.payout")}><Input name="employeePayout" value={employeePayout} onChange={(event) => setEmployeePayout(event.target.value)} inputMode="decimal" required /></FormField>
            <p className="text-xs text-[var(--ui-warning-text)] sm:col-span-2">{t("schedules.taxWarning")}</p>
          </> : <><input type="hidden" name="employeePayout" value={amount} /><FormField label={t("schedules.remittances")}><Input aria-label={t("schedules.remittances")} aria-describedby="payroll-remittances-help" name="employeeDeductions" value={employeeDeductions} onChange={(event) => setEmployeeDeductions(event.target.value)} inputMode="decimal" /><p id="payroll-remittances-help" className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("schedules.remittancesHelp")}</p></FormField></>}</div></AnimatedFormContent></div>
          <FormField label={t("schedules.costStatus")}><Select aria-label={t("schedules.costStatus")} value={costChoice} onValueChange={(value) => {
            if (value !== "unknown" && value !== "none" && value !== "has") return;
            setCostChoice(value);
            if (value !== "has" || costStatus === "unknown") setCostStatus(value === "unknown" ? "unknown" : "fixed");
          }}><SelectItem value="unknown">{t("schedules.costUnknown")}</SelectItem><SelectItem value="none">{t("schedules.costNone")}</SelectItem><SelectItem value="has">{t("schedules.costHas")}</SelectItem></Select></FormField>
          <div className="sm:col-span-2"><AnimatedFormContent isOpen={costChoice === "has"}><fieldset disabled={costChoice !== "has"} className="grid gap-4 sm:grid-cols-2"><FormField label={t("schedules.employerCostAmount")}><Input name="employerCost" value={employerCost} onChange={(event) => setEmployerCost(event.target.value)} inputMode="decimal" required={costChoice === "has"} /></FormField><FormField label={t("schedules.certainty")}><Select aria-label={t("schedules.certainty")} value={costStatus === "estimated" ? "estimated" : "fixed"} onValueChange={setCostStatus}>{["fixed", "estimated"].map((value) => <SelectItem key={value} value={value}>{t(`schedules.${value}`)}</SelectItem>)}</Select></FormField></fieldset></AnimatedFormContent></div>
          {costChoice !== "has" ? <input type="hidden" name="employerCost" value={costChoice === "none" ? "0" : ""} /> : null}
          <input type="hidden" name="employerCostStatus" value={costChoice === "unknown" ? "unknown" : costChoice === "none" ? "fixed" : costStatus === "estimated" ? "estimated" : "fixed"} />
          </div></AnimatedDisclosure>
          {paymentTiming}
          {effectivePeriod}
        </div>
        <AnimatedDisclosure title={t("schedules.note")}><Textarea aria-label={t("schedules.note")} name="reason" rows={2} maxLength={2000} /></AnimatedDisclosure>
        <input type="hidden" name="categoryId" value={salaryCategory?.id ?? ""} /><input type="hidden" name="intervalMonths" value="1" /><input type="hidden" name="commitment" value="agreed" /><input type="hidden" name="certainty" value="fixed" />
      </> : <>
        <GroupField groups={data.groups} value={groupId} onChange={setGroupId} />
        <FormField label={t("schedules.name")}><Input name="name" defaultValue={current?.name ?? ""} maxLength={120} required /></FormField>
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
          <FormField label={t("movements.amount")}><Input name="amount" defaultValue={current?.amount ?? ""} inputMode="decimal" required /></FormField>{currencyField}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)]" checked={certainty === "estimated"} onChange={(event) => setCertainty(event.target.checked ? "estimated" : "fixed")} />{t("planning.estimatedAmount")}</label>
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
        <p className="text-xs text-[var(--ui-text-muted)]">{t("schedules.datesHelp")}</p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)]" checked={commitment === "tentative"} onChange={(event) => setCommitment(event.target.checked ? "tentative" : "agreed")} />{t("planning.plannedPayment")}</label>
        <input type="hidden" name="commitment" value={commitment} />
        {schedule ? <FormField label={t("project.reason")}><Textarea aria-label={t("project.reason")} name="reason" required rows={2} maxLength={2000} /></FormField> : <AnimatedDisclosure title={t("schedules.note")}><Textarea aria-label={t("project.reason")} name="reason" rows={2} maxLength={2000} /></AnimatedDisclosure>}
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
  function termSummary(term: Terms) {
    return <div className="space-y-1 text-sm text-[var(--ui-text-secondary)]">
      <p>{term.valid_through && term.effective_from && term.valid_through < term.effective_from ? t("schedules.neverEffective", { date: date(term.effective_from) }) : `${date(term.effective_from)} – ${date(term.valid_through)}`} · {money(term.amount, term.currency)}{term.basis ? ` · ${t(`schedules.${term.basis}`)}` : ` · ${t(`schedules.${term.certainty}`)}`}</p>
      {term.basis ? <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">{[[t("schedules.payout"), money(term.employee_payout, term.currency)], [t("schedules.deductions"), money(term.employee_deductions, term.currency)], [t("schedules.employerCost"), `${money(term.employer_cost, term.currency)}${term.employer_cost_status !== "unknown" ? ` · ${t(`schedules.${term.employer_cost_status}`)}` : ""}`]].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-0.5 tabular-nums text-[var(--ui-text)]">{value}</dd></div>)}</dl> : <p>{t(`schedules.intervals.${term.interval_months}`)} · {t(`planning.agreementOptions.${term.commitment}`)}</p>}
      <p>{t("schedules.payoutDay")}: {term.payout_day} · {t(term.payment_month_offset === 1 ? "schedules.nextMonth" : "schedules.sameMonth")}</p>
    </div>;
  }
  const termReason = (reason: string | null) => !reason ? "" : ["Compensation agreement", "Домовленість про оплату праці"].includes(reason) ? t("schedules.defaultAgreementNote") : ["Compensation revision", "Нова редакція оплати праці"].includes(reason) ? t("schedules.defaultRevisionNote") : reason;
  const toggle = (id: string) => setExpanded((rows) => rows.includes(id) ? rows.filter((row) => row !== id) : [...rows, id]);
  const quietActions = "flex gap-1 opacity-100 transition-opacity motion-reduce:transition-none lg:pointer-fine:opacity-0 lg:pointer-fine:group-hover:opacity-100 lg:pointer-fine:group-has-[:focus-visible]:opacity-100";
  function ruleRow(schedule: Schedule) {
    const history = data.terms.filter((term) => term.schedule_id === schedule.id);
    const latest = history.find((term) => !term.valid_through || !term.effective_from || term.valid_through >= term.effective_from) ?? history[0];
    const current = history.find((term) => term.effective_from && term.effective_from <= data.today && (!term.valid_through || term.valid_through >= data.today)) ?? latest;
    if (!current) return null;
    const payroll = schedule.kind === "payroll", open = expanded.includes(schedule.id);
    const name = payroll ? data.members.find((member) => member.user_id === schedule.employee_id)?.profile.full_name ?? current.name : current.name;
    const incomplete = payroll && (current.employee_deductions === null || current.employer_cost_status === "unknown");
    const owner = data.categories.find((category) => category.id === current.category_id)?.nature === "owner_distribution";
    return <article key={schedule.id} data-selected={selected.includes(schedule.id) || undefined} onClick={(event) => {
      if (payroll || !(event.ctrlKey || event.metaKey) || !(event.target instanceof Element) || event.target.closest("button, a, input, label, select, textarea")) return;
      event.preventDefault(); selectRule(schedule.id);
    }} className="group px-4 py-2 data-[selected]:bg-[var(--ui-surface-subtle)] transition-colors motion-reduce:transition-none hover:bg-[var(--ui-surface-subtle)] has-[:focus-visible]:bg-[var(--ui-surface-subtle)] sm:px-5">
      <div className="grid items-center gap-x-4 gap-y-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_auto]">
        <div className="flex min-w-0 items-center gap-1">{!payroll ? <label className={`-ml-2 flex size-11 shrink-0 cursor-pointer items-center justify-center transition-opacity duration-150 ${selected.length ? "opacity-100" : "lg:pointer-fine:opacity-0 lg:pointer-fine:group-hover:opacity-100 lg:pointer-fine:group-has-[:focus-visible]:opacity-100"}`}><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ui-focus)]" aria-label={t("schedules.selectRule", { name: name ?? "" })} checked={selected.includes(schedule.id)} onChange={() => selectRule(schedule.id)} /></label> : null}{payroll ? <h3 className="min-w-0 break-words text-sm font-semibold">{name}</h3> : <h4 className="min-w-0 break-words text-sm font-semibold">{name}</h4>}</div>
        <p className="text-sm font-medium tabular-nums">{current.certainty === "estimated" ? "≈ " : ""}{money(current.amount, current.currency)}<span className="font-normal text-[var(--ui-text-secondary)]">{payroll ? ` / ${t("schedules.perMonth")} · ${t(`schedules.${current.basis}`)}` : ` · ${t(`schedules.intervals.${current.interval_months}`)}`}</span></p>
        <div className="text-sm text-[var(--ui-text-secondary)]">{payroll ? <p>{t(current.payment_month_offset === 1 ? "schedules.payoutNext" : "schedules.payoutCurrent", { day: current.payout_day ?? 1 })}</p> : schedule.nextPayment ? <Link className="underline decoration-[var(--ui-border-strong)] underline-offset-4" href={`/finance/expected?item=${schedule.nextPayment.id}&period=all`}>{t("schedules.nextExpected", { date: date(schedule.nextPayment.date) })}</Link> : <p>{t("schedules.noUpcoming")}</p>}
          {incomplete && !schedule.stopped_from ? <button type="button" onClick={() => toggle(schedule.id)} className="min-h-8 cursor-pointer text-xs text-[var(--ui-warning-text)] underline underline-offset-4" aria-expanded={open} aria-controls={`rule-details-${schedule.id}`}>{t("schedules.costsShort")}</button> : null}
        </div>
        <div className={quietActions}>
          {!schedule.stopped_from ? <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.revise")} title={t("schedules.revise")} onClick={() => setEditor({ intent: "schedule", kind: payroll ? "payroll" : "recurring", schedule })}><Pencil className="size-4" aria-hidden="true" /></Button> : null}
          {payroll ? <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.addBonus")} title={t("schedules.addBonus")} onClick={() => setEditor({ intent: "bonus", employeeId: schedule.employee_id ?? undefined })}><Gift className="size-4" aria-hidden="true" /></Button> : <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.moveGroup")} title={t("schedules.moveGroup")} onClick={() => setEditor({ intent: "move", scheduleIds: [schedule.id], groupId: schedule.group_id ?? "" })}><FolderInput className="size-4" aria-hidden="true" /></Button>}
          {!schedule.stopped_from ? <Button variant="ghost" className="size-11 p-0" aria-label={t("schedules.stop")} title={t("schedules.stop")} onClick={() => setEditor({ intent: "stop", schedule })}><CircleStop className="size-4" aria-hidden="true" /></Button> : null}
          <Button variant="ghost" className="size-11 p-0" id={`rule-history-${schedule.id}`} aria-label={t("schedules.history")} title={t("schedules.history")} aria-expanded={open} aria-controls={`rule-details-${schedule.id}`} onClick={() => toggle(schedule.id)}><ChevronDown className={`size-4 transition-transform duration-[220ms] [[data-motion=system]_&]:motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" /></Button>
        </div>
      </div>
      <div className="space-y-1 text-xs text-[var(--ui-text-muted)]">
        {current.effective_through ? <p>{t("schedules.validThroughMonth", { month: monthLabel(current.effective_through) })}</p> : null}
        {current.effective_from && current.effective_from > data.today ? <p>{t("schedules.validFromMonth", { month: monthLabel(current.effective_from) })}</p> : null}
        {latest && latest.id !== current.id && latest.effective_from && latest.effective_from > data.today ? <p>{t("schedules.upcomingChange", { amount: money(latest.amount, latest.currency), month: monthLabel(latest.effective_from) })}</p> : null}
        {schedule.stopped_from ? <p>{t("schedules.stopped", { date: monthLabel(schedule.stopped_from) })}</p> : null}
        {current.commitment === "tentative" ? <p>{t("planning.agreementOptions.tentative")}</p> : null}
        {owner ? <p>{t("movements.kinds.owner_withdrawal")} · {t("schedules.nonOperating")}</p> : null}
      </div>
      <AnimatedFormContent id={`rule-details-${schedule.id}`} labelledBy={`rule-history-${schedule.id}`} isOpen={open}><div className="mt-2 border-t border-[var(--ui-border-subtle)] pt-3">
        {incomplete ? <Link className="mb-3 inline-flex min-h-11 items-center text-sm text-[var(--ui-text-secondary)] underline underline-offset-4" href="/finance/expected?filter=outgoing">{t("schedules.completeCosts")}</Link> : null}
        <ul className="space-y-4">{history.map((term) => <li key={term.id}>{termSummary(term)}<p className="mt-1 break-words text-xs text-[var(--ui-text-muted)]">{termReason(term.reason)}</p></li>)}</ul>
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
  return <div className="mx-auto w-full max-w-7xl space-y-6">
    <PageHeader title={t("schedules.title")} description={t("schedules.description")} />
    {!ready ? <p className={`${panel} p-5 text-sm`}>{t("movements.setupRequired")} <Link href="/finance/accounts" className="underline">{t("movements.setupLink")}</Link></p> : null}
    <section aria-labelledby="section-payroll" className={`${panel} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] px-4 py-3 sm:px-5"><h2 id="section-payroll" className="font-semibold">{t("schedules.payrollSection")}</h2>{ready ? <div className="flex flex-wrap gap-2"><Button className="gap-2" onClick={() => setEditor({ intent: "schedule", kind: "payroll" })}><Plus className="size-4" aria-hidden="true" />{t("schedules.addCompensation")}</Button>{initialPayrollMembers(data).length ? <Button variant="outline" onClick={() => setEditor({ intent: "setup" })}>{t("schedules.setupTeam")}</Button> : null}{!payroll.length ? <Button variant="ghost" onClick={() => setEditor({ intent: "bonus" })}>{t("schedules.addBonus")}</Button> : null}</div> : null}</div>
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
    <Link href="/finance/expected?filter=outgoing" className="inline-flex min-h-11 items-center text-sm text-[var(--ui-text-secondary)] underline underline-offset-4">{t("schedules.openExpected")}</Link>
    <Dialog className={editor?.intent === "move" || editor?.intent === "group" ? "h-auto max-h-[calc(100dvh-1rem)] max-w-lg" : undefined} isOpen={editor !== null} closeDisabled={pending} onRequestClose={close} title={t(editor?.intent === "setup" ? "schedules.setupTeam" : editor?.intent === "group" ? editor.group ? "schedules.renameGroup" : "schedules.addGroup" : editor?.intent === "move" ? "schedules.moveGroup" : editor?.intent === "bonus" ? "schedules.addBonus" : editor?.intent === "stop" ? "schedules.stop" : editor?.schedule ? editor.kind === "payroll" ? "schedules.reviseCompensation" : "schedules.reviseRecurring" : editor?.kind === "payroll" ? "schedules.addCompensation" : "schedules.addRecurring")} closeLabel={t("movements.close")}>
      {editor ? <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">{editor.intent === "setup" ? <PayrollSetup data={data} onPending={setPending} onClose={close} /> : editor.intent === "move" ? <MoveRuleForm data={data} scheduleIds={editor.scheduleIds} initialGroupId={editor.groupId} onMoved={(ids) => setSelected((values) => values.filter((id) => !ids.includes(id)))} onSaved={close} onPending={setPending} /> : editor.intent === "group" ? <FinanceActionForm action={saveFinanceGroup} label={t("planning.save")} onSaved={close} onPending={setPending} onCancel={close} cancelLabel={t("planning.cancel")}><input type="hidden" name="operation" value={editor.group ? "rename" : "create"} /><input type="hidden" name="id" value={editor.group?.id ?? ""} /><FormField label={t("schedules.groupName")}><Input name="name" defaultValue={editor.group?.name ?? ""} maxLength={80} required /></FormField></FinanceActionForm> : <ScheduleForm data={data} editor={editor} onSaved={close} onPending={setPending} />}</div> : null}
    </Dialog>
  </div>;
}
