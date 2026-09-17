"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceSchedule } from "@/app/(app)/finance/schedules/actions";
import type { FinanceSchedulesData, getFinanceData } from "@/data/queries/finance";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { BinarySwitch } from "@/components/ui/binary-switch";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";
import { FinanceCategorySelect } from "./category-select";
import { formatFinanceAmount } from "@/lib/finance";
import { formatDateOnly } from "@/lib/utils";

type Data = NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & FinanceSchedulesData & { today: string };
type Schedule = FinanceSchedulesData["schedules"][number];
type Terms = FinanceSchedulesData["terms"][number];
type Editor = { intent: "schedule"; kind: "payroll" | "recurring"; schedule?: Schedule } | { intent: "generate"; schedule: Schedule } | { intent: "stop"; schedule: Schedule } | { intent: "bonus" };
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

function ScheduleForm({ data, editor, onSaved, onPending }: { data: Data; editor: Editor; onSaved: () => void; onPending: (value: boolean) => void }) {
  const t = useTranslations("Finance");
  const schedule = "schedule" in editor ? editor.schedule : undefined;
  const current = data.terms.find((term) => term.schedule_id === schedule?.id);
  const payroll = editor.intent === "schedule" && editor.kind === "payroll";
  const [employee, setEmployee] = useState(schedule?.employee_id ?? "");
  const [currency, setCurrency] = useState(current?.currency ?? data.settings?.base_currency ?? "UAH");
  const [basis, setBasis] = useState(current?.basis ?? "net");
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
  const [category, setCategory] = useState(current?.category_id ?? "");
  const month = `${data.today.slice(0, 7)}-01`;
  const next = new Date(`${month}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  const [effectiveFromMonth, setEffectiveFromMonth] = useState((schedule ? nextMonth : month).slice(0, 7));
  const [effectiveThroughMonth, setEffectiveThroughMonth] = useState(current?.effective_through?.slice(0, 7) ?? "");
  const salaryCategory = data.categories.find((c) => c.default_key === "salary" && !c.archived_at);
  const chooseEmployee = <FormField label={t("schedules.employee")}><Select name="employeeId" aria-label={t("schedules.employee")} value={employee} onValueChange={setEmployee} required>
    {data.members.filter((m) => editor.intent === "bonus" || (m.is_active && m.profile.is_active)).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.profile.full_name}{!m.is_active ? ` · ${t("schedules.former")}` : ""}</SelectItem>)}
  </Select></FormField>;
  const currencyField = <FormField label={t("currency")}><FinanceCurrencySelect name="currency" currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={currency} onValueChange={setCurrency} /></FormField>;
  return <FinanceActionForm action={saveFinanceSchedule} label={t(editor.intent === "generate" ? "schedules.generate" : editor.intent === "stop" ? "schedules.stop" : "planning.save")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value={editor.intent} />
    {editor.intent === "generate" || editor.intent === "stop" ? <>
      <input type="hidden" name="scheduleId" value={editor.schedule.id} />
      <p className="text-sm text-[var(--ui-text-secondary)]">{t(editor.intent === "generate" ? "schedules.generateHelp" : "schedules.stopHelp")}</p>
      <DateField name="from" label={t(editor.intent === "stop" ? "schedules.stopFrom" : "schedules.from")} initial={editor.intent === "stop" ? nextMonth : month} required />
      {editor.intent === "generate" ? <DateField name="through" label={t("schedules.through")} initial={month} required /> : null}
    </> : editor.intent === "bonus" ? <>
      <p className="text-sm text-[var(--ui-text-secondary)]">{t("schedules.bonusHelp")}</p>
      {chooseEmployee}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("movements.amount")}><Input name="amount" inputMode="decimal" required /></FormField>{currencyField}
        <DateField name="periodStart" label={t("schedules.periodStart")} initial={month} required />
        <DateField name="periodEnd" label={t("schedules.periodEnd")} initial={data.today} required />
        <DateField name="dueDate" label={t("planning.dueDate")} initial={data.today} required />
      </div>
      <FormField label={t("movements.description")}><Textarea name="description" required maxLength={2000} /></FormField>
    </> : <>
      <input type="hidden" name="id" value={schedule?.id ?? ""} /><input type="hidden" name="revision" value={current?.revision ?? 0} /><input type="hidden" name="kind" value={editor.kind} />
      {payroll ? <>
        <input type="hidden" name="name" value={current?.name ?? "Base salary"} />
        {schedule ? <FormField as="div" label={t("schedules.employee")}><input type="hidden" name="employeeId" value={employee} /><div className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] px-3 text-sm font-medium text-[var(--ui-text)]">{data.members.find((m) => m.user_id === employee)?.profile.full_name}</div></FormField> : chooseEmployee}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("schedules.agreedAmount")}><Input name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required /></FormField>{currencyField}
          <div className="sm:col-span-2"><BinarySwitch emptyLabel={t("schedules.net")} label={t("schedules.basis")} value={basis} options={["net", "gross"] as const} optionLabel={(value) => t(`schedules.${value}`)} onChange={setBasis} /><input type="hidden" name="basis" value={basis} /></div>
          {basis === "gross" ? <>
            <FormField label={t("schedules.deductions")}><Input name="employeeDeductions" value={employeeDeductions} onChange={(event) => setEmployeeDeductions(event.target.value)} inputMode="decimal" required /></FormField>
            <FormField label={t("schedules.payout")}><Input name="employeePayout" value={employeePayout} onChange={(event) => setEmployeePayout(event.target.value)} inputMode="decimal" required /></FormField>
            <p className="text-xs text-[var(--ui-warning-text)] sm:col-span-2">{t("schedules.taxWarning")}</p>
          </> : <><input type="hidden" name="employeePayout" value={amount} /><input type="hidden" name="employeeDeductions" value={current?.basis === "net" ? employeeDeductions : ""} /></>}
          <FormField label={t("schedules.costStatus")}><Select aria-label={t("schedules.costStatus")} value={costChoice} onValueChange={(value) => {
            if (value !== "unknown" && value !== "none" && value !== "has") return;
            setCostChoice(value);
            if (value !== "has" || costStatus === "unknown") setCostStatus(value === "unknown" ? "unknown" : "fixed");
          }}><SelectItem value="unknown">{t("schedules.costUnknown")}</SelectItem><SelectItem value="none">{t("schedules.costNone")}</SelectItem><SelectItem value="has">{t("schedules.costHas")}</SelectItem></Select></FormField>
          {costChoice === "has" ? <FormField label={t("schedules.employerCostAmount")}><Input name="employerCost" value={employerCost} onChange={(event) => setEmployerCost(event.target.value)} inputMode="decimal" required /></FormField> : <input type="hidden" name="employerCost" value={costChoice === "none" ? "0" : ""} />}
          <input type="hidden" name="employerCostStatus" value={costChoice === "unknown" ? "unknown" : costChoice === "none" ? "fixed" : costStatus === "estimated" ? "estimated" : "fixed"} />
          <fieldset className="sm:col-span-2"><legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("schedules.payoutTiming")}</legend><div className="flex min-h-11 flex-wrap items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] px-3 py-2 text-sm text-[var(--ui-text-secondary)]"><span>{t("schedules.payoutSentencePrefix")}</span><Input aria-label={t("schedules.payoutDay")} className="ui-numeric w-16 bg-[var(--ui-surface)] text-center" name="payoutDay" type="number" min={1} max={31} defaultValue={current?.payout_day ?? 1} required /><span>{t("schedules.payoutSentenceJoiner")}</span><Select width="content" aria-label={t("schedules.paymentMonth")} value={offset} onValueChange={setOffset} name="paymentMonthOffset"><SelectItem value="0">{t("schedules.payoutCurrentMonth")}</SelectItem><SelectItem value="1">{t("schedules.payoutNextMonth")}</SelectItem></Select></div></fieldset>
          <FormField label={t("schedules.effectiveFrom")}><input type="hidden" name="effectiveFrom" value={effectiveFromMonth ? `${effectiveFromMonth}-01` : ""} /><Input aria-label={t("schedules.effectiveFrom")} type="month" min={schedule ? nextMonth.slice(0, 7) : undefined} value={effectiveFromMonth} onChange={(event) => setEffectiveFromMonth(event.target.value)} required /></FormField>
          <div className="self-start"><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--ui-text-secondary)]"><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)]" checked={hasEndDate} onChange={(event) => setHasEndDate(event.target.checked)} />{t("schedules.hasEndDate")}</label>{hasEndDate ? <div className="mt-2"><FormField label={t("schedules.endDate")}><input type="hidden" name="effectiveThrough" value={monthEnd(effectiveThroughMonth)} /><Input aria-label={t("schedules.endDate")} type="month" min={effectiveFromMonth} value={effectiveThroughMonth} onChange={(event) => setEffectiveThroughMonth(event.target.value)} required /></FormField></div> : <input type="hidden" name="effectiveThrough" value="" />}</div>
        </div>
        {schedule ? <p className="text-xs text-[var(--ui-warning-text)]">{t("schedules.revisionDateHelp")}</p> : null}
        <FormField label={t("schedules.note")} optional optionalLabel={t("schedules.optional")}><Textarea aria-label={t("schedules.note")} name="reason" rows={2} maxLength={2000} /></FormField>
        <input type="hidden" name="categoryId" value={salaryCategory?.id ?? ""} /><input type="hidden" name="intervalMonths" value="1" /><input type="hidden" name="commitment" value="agreed" /><input type="hidden" name="certainty" value="fixed" />
      </> : <>
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("schedules.recurringHelp")}</p>
        <FormField label={t("schedules.name")}><Input name="name" defaultValue={current?.name ?? ""} maxLength={120} required /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("movements.amount")}><Input name="amount" defaultValue={current?.amount ?? ""} inputMode="decimal" required /></FormField>{currencyField}
          <input type="hidden" name="employerCostStatus" value="unknown" />
          <FormField label={t("schedules.recurrence")}><Select name="intervalMonths" aria-label={t("schedules.recurrence")} value={interval} onValueChange={setInterval}>{["1", "3", "12"].map((v) => <SelectItem key={v} value={v}>{t(`schedules.intervals.${v}`)}</SelectItem>)}</Select></FormField>
          <FormField label={t("schedules.certainty")}><Select name="certainty" aria-label={t("schedules.certainty")} value={certainty} onValueChange={setCertainty}>{["fixed", "estimated"].map((v) => <SelectItem key={v} value={v}>{t(`schedules.${v}`)}</SelectItem>)}</Select></FormField>
          <FormField label={t("planning.agreementState")}><Select name="commitment" aria-label={t("planning.agreementState")} value={commitment} onValueChange={setCommitment}>{["agreed", "tentative"].map((v) => <SelectItem key={v} value={v}>{t(`planning.agreementOptions.${v}`)}</SelectItem>)}</Select></FormField>
          <FormField label={t("schedules.payoutDay")}><Input name="payoutDay" type="number" min={1} max={31} defaultValue={current?.payout_day ?? 1} required /></FormField>
          <FormField label={t("schedules.paymentMonth")}><Select name="paymentMonthOffset" aria-label={t("schedules.paymentMonth")} value={offset} onValueChange={setOffset}><SelectItem value="0">{t("schedules.sameMonth")}</SelectItem><SelectItem value="1">{t("schedules.nextMonth")}</SelectItem></Select></FormField>
          <DateField name="effectiveFrom" label={t("schedules.effectiveFrom")} initial={schedule ? nextMonth : month} required />
          <DateField name="effectiveThrough" label={t("schedules.effectiveThrough")} initial="" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={owner} onChange={(e) => { setOwner(e.target.checked); setCategory(""); }} />{t("movements.kinds.owner_withdrawal")}</label>
        {owner ? <p className="text-sm text-[var(--ui-text-muted)]">{t("movements.ownerHelp")}</p> : null}
        <FinanceCategorySelect categories={data.categories} direction="outgoing" owner={owner} value={category} onValueChange={setCategory} />
        <p className="text-xs text-[var(--ui-text-muted)]">{t("schedules.datesHelp")}</p>
        <FormField label={t("project.reason")}><Textarea name="reason" required maxLength={2000} /></FormField>
      </>}
    </>}
  </FinanceActionForm>;
}

export function FinanceSchedulesWorkspace(data: Data) {
  const t = useTranslations("Finance"), locale = useLocale();
  const [editor, setEditor] = useState<Editor | null>(null), [pending, setPending] = useState(false);
  const date = (value: string | null) => value ? formatDateOnly(value, locale) : t("schedules.openEnded");
  const money = (amount: number | null, currency: string | null) => {
    if (amount === null) return t("schedules.unknown");
    const code = data.currencies.find((c) => c.code === currency);
    return code ? formatFinanceAmount(amount, code, locale) : `${amount} ${currency}`;
  };
  function termSummary(term: Terms) {
    return <div className="space-y-1 text-sm text-[var(--ui-text-secondary)]">
      <p>{term.valid_through && term.effective_from && term.valid_through < term.effective_from ? t("schedules.neverEffective", { date: date(term.effective_from) }) : `${date(term.effective_from)} – ${date(term.valid_through)}`} · {money(term.amount, term.currency)}{term.basis ? ` · ${t(`schedules.${term.basis}`)}` : ` · ${t(`schedules.${term.certainty}`)}`}</p>
      {term.basis ? <><p>{t("schedules.payout")}: {money(term.employee_payout, term.currency)} · {t("schedules.deductions")}: {money(term.employee_deductions, term.currency)}</p>
        <p>{t("schedules.employerCost")}: {money(term.employer_cost, term.currency)}{term.employer_cost_status !== "unknown" ? ` · ${t(`schedules.${term.employer_cost_status}`)}` : ""}</p></> : <p>{t(`schedules.intervals.${term.interval_months}`)} · {t(`planning.agreementOptions.${term.commitment}`)}</p>}
      <p>{t("schedules.payoutDay")}: {term.payout_day} · {t(term.payment_month_offset === 1 ? "schedules.nextMonth" : "schedules.sameMonth")}</p>
    </div>;
  }
  const termReason = (reason: string | null) => !reason ? "" : ["Compensation agreement", "Домовленість про оплату праці"].includes(reason) ? t("schedules.defaultAgreementNote") : ["Compensation revision", "Нова редакція оплати праці"].includes(reason) ? t("schedules.defaultRevisionNote") : reason;
  return <div className="mx-auto w-full max-w-4xl space-y-6">
    <PageHeader title={t("schedules.title")} description={t("schedules.description")} />
    {!data.settings?.finalized_at ? <p className={`${panel} p-5 text-sm`}>{t("movements.setupRequired")} <Link href="/finance" className="underline">{t("movements.setupLink")}</Link></p> : <div className="flex flex-wrap gap-2">
      <Button onClick={() => setEditor({ intent: "schedule", kind: "payroll" })}>{t("schedules.addCompensation")}</Button>
      <Button variant="outline" onClick={() => setEditor({ intent: "bonus" })}>{t("schedules.addBonus")}</Button>
      <Button variant="outline" onClick={() => setEditor({ intent: "schedule", kind: "recurring" })}>{t("schedules.addRecurring")}</Button>
    </div>}
    <Link href="/finance/expected?filter=outgoing" className="inline-block text-sm underline">{t("schedules.openExpected")}</Link>
    <section className={`${panel} divide-y divide-[var(--ui-border)]`} aria-label={t("schedules.title")}>
      {data.schedules.length ? data.schedules.map((schedule) => {
        const history = data.terms.filter((term) => term.schedule_id === schedule.id);
        const current = history.find((term) => !term.valid_through || !term.effective_from || term.valid_through >= term.effective_from) ?? history[0];
        if (!current) return null;
        return <article key={schedule.id} className="space-y-3 p-4 sm:p-5">
          <h2 className="break-words font-semibold">{schedule.kind === "payroll" && current.name === "Base salary" ? t("schedules.defaultSalaryName") : current.name}</h2>
          {schedule.employee_id ? <p className="text-sm">{data.members.find((m) => m.user_id === schedule.employee_id)?.profile.full_name}</p> : null}
          {termSummary(current)}
          {schedule.stopped_from ? <p className="text-sm">{t("schedules.stopped", { date: date(schedule.stopped_from) })}</p> : null}
          <div className="flex flex-wrap gap-2">
            {!schedule.stopped_from ? <><Button variant="ghost" onClick={() => setEditor({ intent: "schedule", kind: schedule.kind === "payroll" ? "payroll" : "recurring", schedule })}>{t("schedules.revise")}</Button>
              <Button variant="ghost" onClick={() => setEditor({ intent: "stop", schedule })}>{t("schedules.stop")}</Button></> : null}
            <Button variant="ghost" onClick={() => setEditor({ intent: "generate", schedule })}>{t("schedules.generate")}</Button>
          </div>
          <details><summary className="cursor-pointer text-sm">{t("schedules.history")}</summary><ul className="mt-3 space-y-4">{history.map((term) => <li key={term.id}>{termSummary(term)}<p className="mt-1 break-words text-xs text-[var(--ui-text-muted)]">{termReason(term.reason)}</p></li>)}</ul></details>
        </article>;
      }) : <p className="p-5 text-sm text-[var(--ui-text-muted)]">{t("schedules.empty")}</p>}
    </section>
    <Dialog isOpen={editor !== null} closeDisabled={pending} onRequestClose={() => setEditor(null)} title={t(editor?.intent === "bonus" ? "schedules.addBonus" : editor?.intent === "generate" ? "schedules.generate" : editor?.intent === "stop" ? "schedules.stop" : editor?.kind === "payroll" ? "schedules.addCompensation" : "schedules.addRecurring")} closeLabel={t("movements.close")}>
      {editor ? <div className="p-5"><ScheduleForm data={data} editor={editor} onSaved={() => setEditor(null)} onPending={setPending} /></div> : null}
    </Dialog>
  </div>;
}
