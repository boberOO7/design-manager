"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { saveInitialPayroll } from "@/app/(app)/finance/schedules/actions";
import type { FinanceSchedulesData, getFinanceData } from "@/data/queries/finance";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { BinarySwitch } from "@/components/ui/binary-switch";
import { DatePicker } from "@/components/ui/date-picker";
import { FinanceCurrencySelect } from "./currency-select";
import { payrollCompensationSummary } from "@/lib/finance-schedules";
import { formatFinanceAmount } from "@/lib/finance";

type Data = FinanceSchedulesData & NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & { today: string };
export function initialPayrollMembers(data: Pick<Data, "members" | "schedules">) {
  return data.members.filter((member) => member.is_active && member.profile.is_active && !data.schedules.some((schedule) => schedule.kind === "payroll" && schedule.employee_id === member.user_id && !schedule.stopped_from));
}

function SetupRow({ member, data, result }: { member: Data["members"][number]; data: Data; result?: Awaited<ReturnType<typeof saveInitialPayroll>>["rows"][number] }) {
  const t = useTranslations("Finance"), locale = useLocale();
  const [requestId] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState(false);
  const [currency, setCurrency] = useState(data.settings?.base_currency ?? "UAH"), [basis, setBasis] = useState<"net" | "gross">("net");
  const [amount, setAmount] = useState(""), [deductions, setDeductions] = useState(""), [employerCost, setEmployerCost] = useState("0"), [costUnknown, setCostUnknown] = useState(false);
  const name = (field: string) => `${member.user_id}.${field}`;
  const earliest = data.schedules.filter((schedule) => schedule.employee_id === member.user_id).map((schedule) => schedule.stopped_from?.slice(0, 7) ?? "").sort().at(-1) ?? "";
  const start = [member.joined_at?.slice(0, 7) ?? data.today.slice(0, 7), earliest].sort().at(-1);
  const [month, setMonth] = useState(start), [day, setDay] = useState(String(Number(member.joined_at?.slice(8, 10) ?? "1"))), [offset, setOffset] = useState("1");
  const label = (value: string) => <span className="lg:sr-only">{value}</span>;
  const summary = payrollCompensationSummary(amount, basis, deductions, employerCost);
  const unit = data.currencies.find((item) => item.code === currency);
  return <fieldset disabled={result?.saved} className="border-b border-[var(--ui-border)] py-3 last:border-b-0" aria-label={member.profile.full_name}>
    <input type="hidden" name={name("requestId")} value={requestId} />
    <div className="grid gap-3 lg:grid-cols-[2.75rem_minmax(9rem,1fr)_minmax(9rem,1fr)_7rem_minmax(12rem,1fr)_5rem_10rem_10rem] lg:items-end">
      <label className="flex min-h-11 cursor-pointer items-center justify-center lg:mb-0"><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)]" name={name("selected")} checked={selected} aria-label={t("schedules.selectRule", { name: member.profile.full_name })} onChange={(event) => setSelected(event.target.checked)} /></label>
      <div className="flex min-h-11 items-center text-sm font-medium text-[var(--ui-text)]">{member.profile.full_name}</div>
      <FormField label={label(t("schedules.agreedAmount"))}><Input name={name("amount")} value={amount} inputMode="decimal" required={selected} onChange={(event) => { setAmount(event.target.value); setSelected(Boolean(event.target.value)); }} /></FormField>
      <FormField label={label(t("planning.currency"))}><FinanceCurrencySelect name={name("currency")} aria-label={t("planning.currency")} currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={currency} onValueChange={setCurrency} /></FormField>
      <FormField as="div" label={label(t("schedules.basis"))}><BinarySwitch hideLabel label={t("schedules.basis")} emptyLabel={t("schedules.net")} options={["net", "gross"] as const} value={basis} onChange={setBasis} optionLabel={(value) => t(`schedules.${value}`)} /><input type="hidden" name={name("basis")} value={basis} /></FormField>
      <FormField label={label(t("schedules.payoutDay"))}><Input name={name("day")} type="number" min={1} max={31} value={day} onChange={(event) => setDay(event.target.value)} required={selected} /></FormField>
      <FormField label={label(t("schedules.paymentMonth"))}><Select name={name("offset")} aria-label={t("schedules.paymentMonth")} value={offset} onValueChange={setOffset}><SelectItem value="0">{t("schedules.sameMonth")}</SelectItem><SelectItem value="1">{t("schedules.nextMonth")}</SelectItem></Select></FormField>
      <FormField label={label(t("schedules.effectiveFrom"))}><input type="hidden" name={name("month")} value={month ? `${month}-01` : ""} /><DatePicker aria-label={t("schedules.effectiveFrom")} monthOnly min={earliest ? `${earliest}-01` : undefined} value={month ? `${month}-01` : ""} onValueChange={(value) => setMonth(value.slice(0, 7))} locale={locale} required={selected} /></FormField>
    </div>
    <AnimatedDisclosure className="mt-1" title={t("schedules.payrollCosts")}>
      <div className="space-y-3 pt-3">
        <p className="text-xs text-[var(--ui-text-muted)]">{t("schedules.compensationBasisHelp")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("schedules.employeeTaxes")}><Input name={name("deductions")} aria-label={t("schedules.employeeTaxes")} value={deductions} inputMode="decimal" required={selected && basis === "gross"} onChange={(event) => setDeductions(event.target.value)} /></FormField>
          <div className="space-y-1"><FormField label={t("schedules.employerContributions")}><Input name={name("employerCost")} aria-label={t("schedules.employerContributions")} value={employerCost} inputMode="decimal" disabled={costUnknown} required={selected && !costUnknown} onChange={(event) => setEmployerCost(event.target.value)} /></FormField><label className="flex min-h-9 items-center gap-2 text-xs text-[var(--ui-text-muted)]"><input type="checkbox" className="size-4" name={name("costUnknown")} checked={costUnknown} onChange={event => { setCostUnknown(event.target.checked); setEmployerCost(event.target.checked ? "" : "0"); }} />{t("schedules.costUnknown")}</label><label className="flex min-h-9 items-center gap-2 text-xs text-[var(--ui-text-muted)]"><input type="checkbox" className="size-4" name={name("estimated")} disabled={costUnknown || !employerCost.trim()} />{t("schedules.setupEstimatedCost")}</label></div>
        </div>
        <p className="text-xs text-[var(--ui-text-muted)]">{t("schedules.compensationUnknownHelp")}</p>
        {summary.employeeReceives !== null || summary.studioCost !== null ? <dl className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--ui-border-subtle)] pt-2 text-xs">{summary.employeeReceives !== null ? <div><dt className="inline text-[var(--ui-text-muted)]">{t("schedules.employeeReceives")}</dt><dd className="ml-1 inline font-medium text-[var(--ui-text)]">{unit ? formatFinanceAmount(summary.employeeReceives, unit, locale) : `${summary.employeeReceives} ${currency}`}</dd></div> : null}{summary.studioCost !== null ? <div><dt className="inline text-[var(--ui-text-muted)]">{t("schedules.studioCostSummary")}</dt><dd className="ml-1 inline font-medium text-[var(--ui-text)]">{unit ? formatFinanceAmount(summary.studioCost, unit, locale) : `${summary.studioCost} ${currency}`}</dd></div> : null}</dl> : null}
      </div>
    </AnimatedDisclosure>
    {result ? <p role="status" className={`mt-2 text-sm ${result.saved ? "text-[var(--ui-success-text)]" : "text-[var(--ui-danger-text)]"}`}>{result.message}</p> : null}
  </fieldset>;
}

export function PayrollSetup({ data, onPending, onClose }: { data: Data; onPending: (pending: boolean) => void; onClose: () => void }) {
  const t = useTranslations("Finance"), router = useRouter();
  // Keep the entered rows mounted across revalidation and partial successes.
  const [members] = useState(() => initialPayrollMembers(data));
  const [result, setResult] = useState<Awaited<ReturnType<typeof saveInitialPayroll>>>({ error: "", rows: [] });
  const [pending, startTransition] = useTransition();
  const salaryCategory = data.categories.find((category) => category.default_key === "salary" && !category.archived_at);
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rows = members.filter((member) => form.get(`${member.user_id}.selected`) && !result.rows.some((row) => row.employeeId === member.user_id && row.saved)).map((member) => {
      const value = (key: string) => String(form.get(`${member.user_id}.${key}`) ?? "");
      const basis = value("basis") === "gross" ? "gross" : "net", amount = value("amount"), costUnknown = value("costUnknown") === "on", cost = costUnknown ? "" : value("employerCost").trim();
      return { requestId: value("requestId"), employeeId: member.user_id, kind: "payroll", id: "", revision: 0, name: "Base salary", amount, currency: value("currency"), categoryId: salaryCategory?.id ?? "", intervalMonths: 1, payoutDay: value("day"), paymentMonthOffset: value("offset"), effectiveFrom: value("month"), commitment: "agreed", certainty: "fixed", basis, employeePayout: payrollCompensationSummary(amount, basis, value("deductions"), cost).employeeReceives ?? "", employeeDeductions: value("deductions"), employerCost: cost, employerCostStatus: costUnknown ? "unknown" : value("estimated") ? "estimated" : "fixed", reason: t("schedules.defaultAgreementNote") };
    });
    if (!rows.length) { setResult((previous) => ({ ...previous, error: t("schedules.setupSelect") })); return; }
    onPending(true);
    startTransition(async () => {
      try {
        const response = await saveInitialPayroll(rows);
        setResult((previous) => ({ error: response.error, rows: [...previous.rows.filter((row) => row.saved), ...response.rows] }));
        router.refresh();
      } catch { setResult((previous) => ({ ...previous, error: t("schedules.setupRetry") })); }
      finally { onPending(false); }
    });
  }} className="space-y-4">
    <p className="text-sm text-[var(--ui-text-secondary)]">{t("schedules.setupHelp")}</p>
    <fieldset disabled={pending} className="space-y-4">
      <div className="overflow-x-auto"><div className="lg:min-w-[72rem]"><div className="hidden grid-cols-[2.75rem_minmax(9rem,1fr)_minmax(9rem,1fr)_7rem_minmax(12rem,1fr)_5rem_10rem_10rem] gap-3 border-b border-[var(--ui-border)] px-0 pb-2 text-xs font-medium text-[var(--ui-text-muted)] lg:grid"><span /><span>{t("schedules.employee")}</span><span>{t("schedules.agreedAmount")}</span><span>{t("planning.currency")}</span><span>{t("schedules.basis")}</span><span>{t("schedules.payoutDay")}</span><span>{t("schedules.paymentMonth")}</span><span>{t("schedules.effectiveFrom")}</span></div>{members.map((member) => <SetupRow key={member.user_id} member={member} data={data} result={result.rows.find((row) => row.employeeId === member.user_id)} />)}</div></div>
      {result.error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{result.error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{t("movements.close")}</Button><Button type="submit" disabled={pending || members.every((member) => result.rows.some((row) => row.employeeId === member.user_id && row.saved))}>{t(pending ? "movements.saving" : "schedules.setupSave")}</Button></div>
    </fieldset>
  </form>;
}
