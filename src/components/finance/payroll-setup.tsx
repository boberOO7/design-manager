"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveInitialPayroll } from "@/app/(app)/finance/schedules/actions";
import type { FinanceSchedulesData, getFinanceData } from "@/data/queries/finance";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { BinarySwitch } from "@/components/ui/binary-switch";
import { FinanceCurrencySelect } from "./currency-select";

type Data = FinanceSchedulesData & NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & { today: string };
export function initialPayrollMembers(data: Pick<Data, "members" | "schedules">) {
  return data.members.filter((member) => member.is_active && member.profile.is_active && !data.schedules.some((schedule) => schedule.kind === "payroll" && schedule.employee_id === member.user_id && !schedule.stopped_from));
}

function SetupRow({ member, data, defaults, result }: { member: Data["members"][number]; data: Data; defaults: { currency: string; basis: string; day: string; offset: string }; result?: Awaited<ReturnType<typeof saveInitialPayroll>>["rows"][number] }) {
  const t = useTranslations("Finance");
  const [requestId] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState(false), [override, setOverride] = useState(false);
  const [currency, setCurrency] = useState(defaults.currency), [basis, setBasis] = useState(defaults.basis);
  const [day, setDay] = useState(defaults.day), [offset, setOffset] = useState(defaults.offset);
  const activeBasis = override ? basis : defaults.basis;
  const name = (field: string) => `${member.user_id}.${field}`;
  const earliest = data.schedules.filter((schedule) => schedule.employee_id === member.user_id).map((schedule) => schedule.stopped_from?.slice(0, 7) ?? "").sort().at(-1) ?? "";
  const start = [member.joined_at?.slice(0, 7) ?? data.today.slice(0, 7), earliest].sort().at(-1);
  return <fieldset disabled={result?.saved} className="border-b border-[var(--ui-border)] py-4 last:border-b-0" aria-label={member.profile.full_name}>
    <input type="hidden" name={name("requestId")} value={requestId} />
    <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_12rem]">
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4" name={name("selected")} checked={selected} onChange={(event) => setSelected(event.target.checked)} />{member.profile.full_name}</label>
      <FormField label={t("schedules.agreedAmount")}><Input name={name("amount")} inputMode="decimal" required={selected} onChange={(event) => setSelected(Boolean(event.target.value))} /></FormField>
      <FormField label={t("schedules.effectiveFrom")}><Input name={name("month")} type="month" min={earliest || undefined} defaultValue={start} required={selected} /></FormField>
    </div>
    <AnimatedFormContent isOpen={activeBasis === "gross"}><fieldset disabled={activeBasis !== "gross"} className="pt-3 grid gap-3 sm:grid-cols-2"><FormField label={t("schedules.deductions")}><Input name={name("deductions")} inputMode="decimal" required={selected && activeBasis === "gross"} /></FormField><FormField label={t("schedules.payout")}><Input name={name("payout")} inputMode="decimal" required={selected && activeBasis === "gross"} /></FormField></fieldset></AnimatedFormContent>
    <AnimatedDisclosure className="mt-1" title={t("schedules.setupOverrides")}>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" name={name("override")} checked={override} onChange={(event) => { if (event.target.checked) { setCurrency(defaults.currency); setBasis(defaults.basis); setDay(defaults.day); setOffset(defaults.offset); } setOverride(event.target.checked); }} />{t("schedules.setupCustomDefaults")}</label>
      <AnimatedFormContent isOpen={override}><fieldset disabled={!override} className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("planning.currency")}><FinanceCurrencySelect name={name("currency")} aria-label={t("planning.currency")} currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={currency} onValueChange={setCurrency} /></FormField>
        <div className="motion-reduce:[&_*]:transition-none"><BinarySwitch label={t("schedules.basis")} emptyLabel={t("schedules.net")} options={["net", "gross"] as const} value={basis} onChange={setBasis} optionLabel={(value) => t(`schedules.${value}`)} /><input type="hidden" name={name("basis")} value={basis} /></div>
        <FormField label={t("schedules.payoutDay")}><Input name={name("day")} type="number" min={1} max={31} value={day} onChange={(event) => setDay(event.target.value)} required={selected && override} /></FormField>
        <FormField label={t("schedules.paymentMonth")}><select name={name("offset")} value={offset} onChange={(event) => setOffset(event.target.value)} className="h-11 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3"><option value="0">{t("schedules.sameMonth")}</option><option value="1">{t("schedules.nextMonth")}</option></select></FormField>
      </fieldset></AnimatedFormContent>
      <AnimatedFormContent isOpen><div className="pt-3 grid gap-3 sm:grid-cols-2">
        {activeBasis === "net" ? <FormField label={t("schedules.remittances")}><Input name={name("deductions")} aria-label={t("schedules.remittances")} aria-describedby={name("remittancesHelp")} inputMode="decimal" /><p id={name("remittancesHelp")} className="text-xs font-normal text-[var(--ui-text-muted)]">{t("schedules.remittancesHelp")}</p></FormField> : null}
        <FormField label={t("schedules.employerCost")}><Input name={name("employerCost")} aria-label={t("schedules.employerCost")} aria-describedby={name("costHelp")} inputMode="decimal" /><p id={name("costHelp")} className="text-xs font-normal text-[var(--ui-text-muted)]">{t("schedules.setupCostHelp")}</p></FormField>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" name={name("estimated")} />{t("schedules.setupEstimatedCost")}</label>
      </div></AnimatedFormContent>
    </AnimatedDisclosure>
    {result ? <p role="status" className={`mt-2 text-sm ${result.saved ? "text-[var(--ui-success-text)]" : "text-[var(--ui-danger-text)]"}`}>{result.message}</p> : null}
  </fieldset>;
}

export function PayrollSetup({ data, onPending, onClose }: { data: Data; onPending: (pending: boolean) => void; onClose: () => void }) {
  const t = useTranslations("Finance"), router = useRouter();
  // Keep the entered rows mounted across revalidation and partial successes.
  const [members] = useState(() => initialPayrollMembers(data));
  const [defaults, setDefaults] = useState({ currency: data.settings?.base_currency ?? "UAH", basis: "net", day: "1", offset: "1" });
  const [result, setResult] = useState<Awaited<ReturnType<typeof saveInitialPayroll>>>({ error: "", rows: [] });
  const [pending, startTransition] = useTransition();
  const salaryCategory = data.categories.find((category) => category.default_key === "salary" && !category.archived_at);
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rows = members.filter((member) => form.get(`${member.user_id}.selected`) && !result.rows.some((row) => row.employeeId === member.user_id && row.saved)).map((member) => {
      const value = (key: string) => String(form.get(`${member.user_id}.${key}`) ?? "");
      const custom = Boolean(value("override")), basis = custom ? value("basis") : defaults.basis, amount = value("amount"), cost = value("employerCost");
      return { requestId: value("requestId"), employeeId: member.user_id, kind: "payroll", id: "", revision: 0, name: "Base salary", amount, currency: custom ? value("currency") : defaults.currency, categoryId: salaryCategory?.id ?? "", intervalMonths: 1, payoutDay: custom ? value("day") : defaults.day, paymentMonthOffset: custom ? value("offset") : defaults.offset, effectiveFrom: `${value("month")}-01`, commitment: "agreed", certainty: "fixed", basis, employeePayout: basis === "net" ? amount : value("payout"), employeeDeductions: value("deductions"), employerCost: cost, employerCostStatus: cost ? value("estimated") ? "estimated" : "fixed" : "unknown", reason: t("schedules.defaultAgreementNote") };
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
      <fieldset className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3"><legend className="px-1 text-sm font-semibold">{t("schedules.setupDefaults")}</legend><div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("planning.currency")}><FinanceCurrencySelect name="defaultCurrency" aria-label={t("planning.currency")} currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={defaults.currency} onValueChange={(currency) => setDefaults({ ...defaults, currency })} /></FormField>
        <div className="motion-reduce:[&_*]:transition-none"><BinarySwitch label={t("schedules.basis")} emptyLabel={t("schedules.net")} options={["net", "gross"] as const} value={defaults.basis} onChange={(basis) => setDefaults({ ...defaults, basis })} optionLabel={(value) => t(`schedules.${value}`)} /></div>
        <FormField label={t("schedules.payoutDay")}><Input type="number" min={1} max={31} value={defaults.day} onChange={(event) => setDefaults({ ...defaults, day: event.target.value })} required /></FormField>
        <FormField label={t("schedules.paymentMonth")}><Select value={defaults.offset} aria-label={t("schedules.paymentMonth")} onValueChange={(offset) => setDefaults({ ...defaults, offset })}><SelectItem value="0">{t("schedules.sameMonth")}</SelectItem><SelectItem value="1">{t("schedules.nextMonth")}</SelectItem></Select></FormField>
      </div></fieldset>
      <div>{members.map((member) => <SetupRow key={member.user_id} member={member} data={data} defaults={defaults} result={result.rows.find((row) => row.employeeId === member.user_id)} />)}</div>
      {result.error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{result.error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>{t("movements.close")}</Button><Button type="submit" disabled={pending || members.every((member) => result.rows.some((row) => row.employeeId === member.user_id && row.saved))}>{t(pending ? "movements.saving" : "schedules.setupSave")}</Button></div>
    </fieldset>
  </form>;
}
