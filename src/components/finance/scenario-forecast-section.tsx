"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { formatDateOnly } from "@/lib/utils";
import { financeAmountText, financeAmountUnits, formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { forecastIssueHref, type ForecastFx } from "@/lib/finance-forecast";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { DatePicker } from "@/components/ui/date-picker";
import { FinanceActionForm } from "@/components/finance/finance-action-form";
import { saveFinanceCashPlan } from "@/app/(app)/finance/planning/actions";
import { saveFinanceForecastScenario } from "@/app/(app)/finance/planning/scenario-actions";
import type { FinanceScenarioData } from "@/data/queries/finance-scenarios";
import type { getFinanceData } from "@/data/queries/finance";
import { scenarioAssumptionsSchema, type ScenarioAssumption, type ScenarioReport } from "@/lib/finance-scenarios";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
type ScenarioRevision = FinanceScenarioData["workspace"]["scenarios"][number];
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";

function newAssumption(type: ScenarioAssumption["type"], currency: string, date: string): ScenarioAssumption {
  const id = crypto.randomUUID();
  if (type === "income_delay") return { id, type, itemId: "", date };
  if (type === "expense_change") return { id, type, itemId: "" };
  if (type === "expense") return { id, type, description: "", categoryId: "", currency, amount: "0", date, repeat: "once" };
  if (type === "order") return { id, type, description: "", categoryId: "", currency, payments: [{ id: crypto.randomUUID(), date, amount: "0" }] };
  return { id, type, currency, rate: "1" };
}

function previewDetails(value: unknown): Array<{ key: "amount" | "date" | "expected_payment_date" | "due_date" | "currency" | "version"; value: string }> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) return [];
  return (["amount", "date", "expected_payment_date", "due_date", "currency", "version"] as const).flatMap(key => {
    const part = parsed.data[key];
    return typeof part === "string" || typeof part === "number" ? [{ key, value: String(part) }] : [];
  });
}

function ScenarioComparison({ baseline, scenario, currency, displayFxMissing, locale }: { baseline: ScenarioReport; scenario: ScenarioReport; currency: FinanceCurrency; displayFxMissing: boolean; locale: string }) {
  const t = useTranslations("Finance.forecast.scenarios");
  const amount = (value: string) => displayFxMissing || baseline.riskIncomplete || scenario.riskIncomplete ? "—" : formatFinanceAmount(value, currency, locale);
  const delta = (current: string, prior: string) => financeAmountText(financeAmountUnits(current, currency.minor_units) - financeAmountUnits(prior, currency.minor_units), currency.minor_units);
  const baseEnd = baseline.months.at(-1)?.closing ?? baseline.cashBase;
  const scenarioEnd = scenario.months.at(-1)?.closing ?? scenario.cashBase;
  const baseByMonth = new Map(baseline.months.map(row => [row.month, row]));
  return <div className="space-y-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] p-3">
    <p className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("scenarioVsBaseline")}</p>
    <div className="grid gap-2 sm:grid-cols-3"><p className="text-xs">{t("closingDelta")}<strong className="ui-numeric mt-1 block text-sm text-[var(--ui-text)]">{amount(delta(scenarioEnd, baseEnd))}</strong></p><p className="text-xs">{t("baselineMinimum")}<strong className="ui-numeric mt-1 block text-sm text-[var(--ui-text)]">{baseline.lowPoint && !displayFxMissing ? `${amount(baseline.lowPoint.amount)} · ${formatDateOnly(baseline.lowPoint.date, locale)}` : "—"}</strong></p><p className="text-xs">{t("scenarioMinimum")}<strong className="ui-numeric mt-1 block text-sm text-[var(--ui-text)]">{scenario.lowPoint && !displayFxMissing ? `${amount(scenario.lowPoint.amount)} · ${formatDateOnly(scenario.lowPoint.date, locale)}` : "—"}</strong></p></div>
    <p className="text-xs text-[var(--ui-text-secondary)]">{t("deficitComparison", { baseline: baseline.riskIncomplete ? "—" : baseline.firstDeficit ? formatDateOnly(baseline.firstDeficit, locale) : t("noDeficit"), scenario: scenario.riskIncomplete ? "—" : scenario.firstDeficit ? formatDateOnly(scenario.firstDeficit, locale) : t("noDeficit") })}</p>
    <div className="overflow-x-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)]"><table className="w-full text-left text-xs [&_th]:p-2 [&_th]:font-medium [&_td]:p-2 [&_tr]:border-b [&_tr:last-child]:border-0"><thead className="bg-[var(--ui-surface-subtle)] text-[var(--ui-text-muted)]"><tr><th>{t("month")}</th><th className="text-right">{t("baselineClosing")}</th><th className="text-right">{t("scenarioClosing")}</th><th className="text-right">{t("closingDelta")}</th></tr></thead><tbody>{scenario.months.map(row => { const base = baseByMonth.get(row.month); return <tr key={row.month}><th scope="row">{new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${row.month}T00:00:00Z`))}</th><td className="ui-numeric text-right">{base ? amount(base.closing) : "—"}</td><td className="ui-numeric text-right font-medium">{amount(row.closing)}</td><td className="ui-numeric text-right">{base ? amount(delta(row.closing, base.closing)) : "—"}</td></tr>; })}</tbody></table></div>
  </div>;
}

function assumptionSummary(item: ScenarioAssumption, currencies: FinanceCurrency[], locale: string, sourceFor: (id: string) => { description: string; currency: string } | undefined, baseCurrency: string, repeatLabels: { once: string; monthly: string }, missingCurrency: string) {
  const formatDate = (value: string | undefined) => value ? formatDateOnly(value, locale) : "—";
  const formatAmount = (value: string, code: string) => {
    const unit = currencies.find(currency => currency.code === code);
    return unit ? formatFinanceAmount(value, unit, locale) : `${value} ${code}`;
  };
  if (item.type === "income_delay") return `${sourceFor(item.itemId)?.description ?? item.itemId.slice(0, 8)} → ${formatDate(item.date)}`;
  if (item.type === "expense_change") {
    const source = sourceFor(item.itemId);
    return `${source?.description ?? item.itemId.slice(0, 8)}${item.date ? ` · ${formatDate(item.date)}` : ""}${item.amount ? ` · ${source ? formatAmount(item.amount, source.currency) : `${item.amount} ${missingCurrency}`}` : ""}`;
  }
  if (item.type === "expense") return `${item.description} · ${formatAmount(item.amount, item.currency)} · ${formatDate(item.date)} · ${item.repeat === "once" ? repeatLabels.once : repeatLabels.monthly}`;
  if (item.type === "order") return `${item.description} · ${item.payments.map(payment => `${formatDate(payment.date)} ${formatAmount(payment.amount, item.currency)}`).join(", ")}`;
  return `1 ${item.currency} = ${item.rate} ${baseCurrency}`;
}

function ScenarioEditor({ data, scenario, initialBaseId, onClose, onSaved }: { data: FinanceScenarioData; scenario: ScenarioRevision | null; initialBaseId: string; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("Finance.forecast.scenarios");
  const base = data.workspace.base;
  const [name, setName] = useState(scenario?.name ?? "");
  const [assumptions, setAssumptions] = useState<ScenarioAssumption[]>(scenario?.assumptions ?? []);
  const [reason, setReason] = useState(scenario?.reason ?? "");
  const [rebaseConfirmed, setRebaseConfirmed] = useState(false);
  const [baseId] = useState(scenario && scenario.baseId !== initialBaseId ? initialBaseId : scenario?.baseId ?? initialBaseId);
  const rebase = Boolean(scenario && scenario.baseId !== baseId);
  const preview = rebase ? scenario?.rebasePreview : null;
  const invalidIds = new Set(preview?.invalidItemIds ?? []);
  const unresolved = assumptions.some(item => "itemId" in item && invalidIds.has(item.itemId));
  const currencies = base?.inputs.currencies ?? [];
  const categories = base?.inputs.categories.filter(item => item.nature === "operating" && !item.archivedAt) ?? [];
  const expected = base?.inputs.expected ?? [];
  const update = (id: string, transform: (item: ScenarioAssumption) => ScenarioAssumption) => setAssumptions(items => items.map(item => item.id === id ? transform(item) : item));
  const add = (type: ScenarioAssumption["type"]) => { const native = base?.inputs.currency ?? data.displayCurrency; const currency = type === "fx" ? currencies.find(value => value.code !== native)?.code ?? "" : native; setAssumptions(items => [...items, newAssumption(type, currency, base?.inputs.asOf ?? "" )]); };
  const itemLabel = (id: string) => expected.find(item => item.id === id)?.description || id;
  const previewValue = (value: unknown) => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return previewDetails(value).map(field => `${t(`previewFields.${field.key}`)}: ${field.value}`).join(" · ") || "—";
  };
  const changedBase = Boolean(scenario && baseId !== scenario.baseId);
  const datesValid = assumptions.every(item => item.type === "income_delay" ? item.date >= (base?.inputs.asOf ?? "1900-01-01")
    : item.type === "expense_change" ? !item.date || item.date >= (base?.inputs.asOf ?? "1900-01-01")
    : item.type === "expense" ? item.date >= (base?.inputs.asOf ?? "1900-01-01") && (!item.endDate || item.endDate >= item.date)
    : item.type === "order" ? item.payments.every(payment => payment.date >= (base?.inputs.asOf ?? "1900-01-01")) : true);
  const assumptionsValid = scenarioAssumptionsSchema.safeParse(assumptions).success && datesValid;
  const valid = name.trim().length > 0 && reason.trim().length > 0 && assumptionsValid && !unresolved && (!rebase || (Boolean(preview) && rebaseConfirmed));

  return <section className={`${panel} space-y-4 p-4 sm:p-5`} aria-labelledby="scenario-editor-title">
    <div className="flex items-start justify-between gap-3"><div><h3 id="scenario-editor-title" className="font-semibold">{t(scenario ? "editTitle" : "newTitle")}</h3><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("editorHelp", { base: base?.name ?? t("missingBase") })}</p></div><Button type="button" variant="ghost" size="sm" onClick={onClose}>{t("close")}</Button></div>
    {!base ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("missingBase")}</p> : <FinanceActionForm key={`${scenario?.id ?? "new"}:${baseId}`} action={saveFinanceForecastScenario} onSaved={() => { onSaved(); }} label={t("save")} disabled={!valid}>
      <input type="hidden" name="scenarioId" value={scenario?.scenarioId ?? ""}/><input type="hidden" name="revision" value={scenario?.revision ?? 0}/><input type="hidden" name="baseId" value={baseId}/>
      <input type="hidden" name="assumptions" value={JSON.stringify(assumptions)}/><input type="hidden" name="rebaseConfirmed" value={rebaseConfirmed ? "true" : "false"}/>
      <FormField label={t("name")}><Input name="name" maxLength={120} value={name} onChange={event => setName(event.target.value)} required list="finance-scenario-name-suggestions"/><datalist id="finance-scenario-name-suggestions">{["base", "conservative", "optimistic"].map(value => <option key={value} value={t(`suggestedNames.${value}`)}/>)}</datalist></FormField>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{t("assumptions")}</p><div className="flex flex-wrap gap-1.5">{(["income_delay", "expense_change", "expense", "order", "fx"] as const).map(type => <Button key={type} type="button" variant="outline" size="sm" disabled={type === "fx" && !currencies.some(value => value.code !== base?.inputs.currency)} onClick={() => add(type)}>{t(`types.${type}`)} +</Button>)}</div></div>
        {!assumptions.length ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("noAssumptions")}</p> : assumptions.map(item => <AssumptionEditor key={item.id} item={item} currencies={currencies.map(currency => currency.code)} baseCurrency={base?.inputs.currency ?? data.displayCurrency} categories={categories} expected={expected} baseAsOf={base?.inputs.asOf ?? "1900-01-01"} invalid={"itemId" in item && invalidIds.has(item.itemId)} itemLabel={"itemId" in item ? itemLabel(item.itemId) : ""} onChange={transform => update(item.id, transform)} onRemove={() => setAssumptions(items => items.filter(row => row.id !== item.id))} />)}
      </div>
      {preview ? <div className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] p-3 text-sm">
        <p className="font-medium">{t("rebaseTitle", { base: base.name })}</p><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("rebaseHelp")}</p>
        <ul className="mt-2 space-y-1 text-xs">{preview.changes.map(change => <li key={change.id}><span className="font-medium">{change.label}</span> · {t(`changeStatus.${change.status}`)}<span className="ml-1 text-[var(--ui-text-secondary)]">{previewValue(change.before)} → {previewValue(change.after)}</span></li>)}</ul>
        {preview.cashChanged ? <p className="mt-2 text-xs text-[var(--ui-warning-text)]">{t("cashChanged")}</p> : null}
        {unresolved ? <p role="alert" className="mt-2 text-xs text-[var(--ui-danger-text)]">{t("missingSources")}</p> : null}
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={rebaseConfirmed} onChange={event => setRebaseConfirmed(event.target.checked)} className="mt-1 size-4"/>{t("confirmRebase")}</label>
      </div> : null}
      {!assumptionsValid ? <p role="status" className="text-xs text-[var(--ui-warning-text)]">{t("completeAssumptions")}</p> : null}
      <FormField label={t("reason")}><Textarea name="reason" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} required rows={2}/></FormField>
      {changedBase && !preview ? <p role="status" className="text-xs text-[var(--ui-warning-text)]">{t("rebaseUnavailable")}</p> : null}
    </FinanceActionForm>}
  </section>;
}

function AssumptionEditor({ item, currencies, baseCurrency, categories, expected, baseAsOf, invalid, itemLabel, onChange, onRemove }: { item: ScenarioAssumption; currencies: string[]; baseCurrency: string; categories: Array<{ id: string; name: string; direction: "incoming" | "outgoing"; nature: string; default_key?: string | null; custom_name?: boolean }>; expected: Array<{ id: string; description: string; direction: "incoming" | "outgoing"; currency: string; remaining_amount: string; expected_payment_date: string | null; due_date: string | null; version: number; commitment: "agreed" | "tentative" }>; baseAsOf: string; invalid: boolean; itemLabel: string; onChange: (transform: (item: ScenarioAssumption) => ScenarioAssumption) => void; onRemove: () => void }) {
  const t = useTranslations("Finance.forecast.scenarios");
  const finance = useTranslations("Finance");
  const locale = useLocale();
  const field = "grid gap-3 sm:grid-cols-2";
  const textInput = (label: string, value: string, change: (value: string) => void, props: { type?: string; inputMode?: "decimal"; required?: boolean; min?: string; maxLength?: number } = {}) => <FormField label={label}><Input value={value} onChange={event => change(event.target.value)} {...props}/></FormField>;
  const dateInput = (label: string, value: string, change: (value: string) => void, required = true, min = baseAsOf) => <FormField label={label}><DatePicker locale={locale} value={value} onValueChange={change} required={required} min={min}/></FormField>;
  const categorySelect = (label: string, value: string, direction: "incoming" | "outgoing", change: (value: string) => void) => <FormField label={label}><Select value={value} onValueChange={change} required><SelectItem value="">{t("chooseCategory")}</SelectItem>{categories.filter(category => category.direction === direction && category.nature === "operating").map(category => <SelectItem key={category.id} value={category.id}>{category.default_key && category.custom_name === false ? finance(`planning.defaults.${category.default_key}`) : category.name}</SelectItem>)}</Select></FormField>;
  const currencySelect = (label: string, value: string, change: (value: string) => void, excluded?: string) => <FormField label={label}><Select value={value} onValueChange={change} required><SelectItem value="">{t("chooseCurrency")}</SelectItem>{currencies.filter(currency => currency !== excluded).map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</Select></FormField>;
  const sourceCurrency = "itemId" in item ? expected.find(source => source.id === item.itemId)?.currency : undefined;
  return <div className={`rounded-[var(--ui-radius-control)] border ${invalid ? "border-[var(--ui-danger-text)]" : "border-[var(--ui-border-subtle)]"} bg-[var(--ui-surface-subtle)] p-3`}>
    <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{t(`types.${item.type}`)}</p><Button type="button" size="sm" variant="ghost" onClick={onRemove}>{t("remove")}</Button></div>
    {item.type === "income_delay" ? <div className={field}><FormField label={t("sourceItem")}><Select value={item.itemId} onValueChange={itemId => { const source = expected.find(value => value.id === itemId); const originalDate = source?.expected_payment_date ?? source?.due_date ?? baseAsOf; const earliest = originalDate < baseAsOf ? baseAsOf : originalDate; onChange(row => row.type === "income_delay" ? { ...row, itemId, date: earliest } : row); }} required><SelectItem value="">{t("chooseSource")}</SelectItem>{item.itemId && !expected.some(source => source.id === item.itemId) ? <SelectItem value={item.itemId}>{itemLabel} · {t("missingSource")}</SelectItem> : null}{expected.filter(source => source.direction === "incoming").map(source => <SelectItem key={source.id} value={source.id}>{source.description}</SelectItem>)}</Select></FormField>{dateInput(t("moveToDate"), item.date, date => onChange(row => row.type === "income_delay" ? { ...row, date } : row), true, [baseAsOf, expected.find(source => source.id === item.itemId)?.expected_payment_date ?? expected.find(source => source.id === item.itemId)?.due_date ?? baseAsOf].sort().at(-1) ?? baseAsOf)}</div> : null}
    {item.type === "expense_change" ? <div className={field}><FormField label={t("sourceItem")}><Select value={item.itemId} onValueChange={itemId => onChange(row => row.type === "expense_change" ? { ...row, itemId } : row)} required><SelectItem value="">{t("chooseSource")}</SelectItem>{item.itemId && !expected.some(source => source.id === item.itemId) ? <SelectItem value={item.itemId}>{itemLabel} · {t("missingSource")}</SelectItem> : null}{expected.filter(source => source.direction === "outgoing").map(source => <SelectItem key={source.id} value={source.id}>{source.description} · {source.currency}</SelectItem>)}</Select></FormField><div className="grid gap-3 sm:grid-cols-2">{dateInput(t("moveToDate"), item.date ?? "", date => onChange(row => row.type === "expense_change" ? { ...row, date: date || undefined } : row), false)}{textInput(t("replacementAmount", { currency: sourceCurrency ?? t("unknownCurrency") }), item.amount ?? "", amount => onChange(row => row.type === "expense_change" ? { ...row, amount: amount || undefined } : row), { inputMode: "decimal" })}</div></div> : null}
    {item.type === "expense" ? <div className="space-y-3"><div className={field}>{textInput(t("description"), item.description, description => onChange(row => row.type === "expense" ? { ...row, description } : row), { required: true, maxLength: 2000 })}{categorySelect(t("category"), item.categoryId, "outgoing", categoryId => onChange(row => row.type === "expense" ? { ...row, categoryId } : row))}{currencySelect(t("currency"), item.currency, currency => onChange(row => row.type === "expense" ? { ...row, currency } : row))}{textInput(t("amount"), item.amount, amount => onChange(row => row.type === "expense" ? { ...row, amount } : row), { inputMode: "decimal", required: true })}{dateInput(t("date"), item.date, date => onChange(row => row.type === "expense" ? { ...row, date } : row))}<FormField label={t("repeat")}><Select value={item.repeat} onValueChange={repeat => onChange(row => row.type === "expense" ? { ...row, repeat: repeat === "monthly" ? "monthly" : "once", ...(repeat === "once" ? { endDate: undefined } : {}) } : row)}><SelectItem value="once">{t("once")}</SelectItem><SelectItem value="monthly">{t("monthly")}</SelectItem></Select></FormField>{item.repeat === "monthly" ? dateInput(t("endDate"), item.endDate ?? "", date => onChange(row => row.type === "expense" ? { ...row, endDate: date || undefined } : row), false, item.date) : null}</div></div> : null}
    {item.type === "order" ? <div className="space-y-3"><div className={field}>{textInput(t("description"), item.description, description => onChange(row => row.type === "order" ? { ...row, description } : row), { required: true, maxLength: 2000 })}{categorySelect(t("incomeCategory"), item.categoryId, "incoming", categoryId => onChange(row => row.type === "order" ? { ...row, categoryId } : row))}{currencySelect(t("currency"), item.currency, currency => onChange(row => row.type === "order" ? { ...row, currency } : row))}</div><div className="space-y-2"><p className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("payments")}</p>{item.payments.map(payment => <div key={payment.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">{dateInput(t("date"), payment.date, date => onChange(row => row.type === "order" ? { ...row, payments: row.payments.map(part => part.id === payment.id ? { ...part, date } : part) } : row))}{textInput(t("amount"), payment.amount, amount => onChange(row => row.type === "order" ? { ...row, payments: row.payments.map(part => part.id === payment.id ? { ...part, amount } : part) } : row), { inputMode: "decimal", required: true })}<Button type="button" size="sm" variant="ghost" onClick={() => onChange(row => row.type === "order" ? { ...row, payments: row.payments.filter(part => part.id !== payment.id) } : row)}>{t("remove")}</Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => onChange(row => row.type === "order" ? { ...row, payments: [...row.payments, { id: crypto.randomUUID(), date: baseAsOf, amount: "0" }] } : row)}>{t("addPayment")}</Button></div></div> : null}
    {item.type === "fx" ? <div className={field}>{currencySelect(t("currency"), item.currency, currency => onChange(row => row.type === "fx" ? { ...row, currency } : row), baseCurrency)}{textInput(t("rate", { currency: item.currency || "XXX", base: baseCurrency }), item.rate, rate => onChange(row => row.type === "fx" ? { ...row, rate } : row), { inputMode: "decimal", required: true })}</div> : null}
  </div>;
}

function ReportSummary({ report, currency, displayFxMissing, locale, compactMonthDetail = false }: { report: ScenarioReport; currency: FinanceCurrency; displayFxMissing: boolean; locale: string; compactMonthDetail?: boolean }) {
  const t = useTranslations("Finance.forecast.scenarios");
  const forecast = useTranslations("Finance.forecast");
  const diagnosticCount = report.issues.length + Number(report.cashIncomplete);
  const amount = (value: string) => displayFxMissing || report.riskIncomplete ? "—" : formatFinanceAmount(value, currency, locale);
  const monthLabel = (month: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`));
  return <div className="space-y-3">
    {displayFxMissing ? <p role="status" className="text-xs text-[var(--ui-warning-text)]">{t("nativeFxUnavailable", { currency: report.currency, date: formatDateOnly(report.asOf, locale) })} <Link href="/finance/reports#fx-history" className="underline underline-offset-2">{t("reviewFxAction")}</Link></p> : null}
    <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3"><p className="text-xs text-[var(--ui-text-muted)]">{t("closing")}</p><p className="ui-numeric mt-1 font-semibold">{amount(report.months.at(-1)?.closing ?? report.cashBase)}</p></div><div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3"><p className="text-xs text-[var(--ui-text-muted)]">{t("minimumCash")}</p><p className="ui-numeric mt-1 font-semibold">{report.lowPoint && !displayFxMissing ? `${amount(report.lowPoint.amount)} · ${formatDateOnly(report.lowPoint.date, locale)}` : "—"}</p></div><div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3"><p className="text-xs text-[var(--ui-text-muted)]">{t("firstDeficit")}</p><p className="mt-1 font-semibold">{report.riskIncomplete ? "—" : report.firstDeficit ? formatDateOnly(report.firstDeficit, locale) : t("noDeficit")}</p></div></div>
    {report.incomplete ? <div role="status" className="space-y-1 text-xs text-[var(--ui-warning-text)]"><p>{t("incomplete", { count: diagnosticCount })}</p><AnimatedDisclosure title={t("diagnostics", { count: diagnosticCount })}><ul className="divide-y divide-[var(--ui-border)] pb-2">{report.cashIncomplete ? <li className="py-2"><Link className="font-medium underline underline-offset-2" href="/finance/accounts">{t("cashIncomplete")}</Link></li> : null}{report.issues.map((issue, index) => <li key={`${issue.source}:${issue.id}:${index}`} className="py-2"><Link className="font-medium underline underline-offset-2" href={forecastIssueHref(issue)}>{issue.label || forecast("item")}</Link><span className="ml-2">{forecast(`issues.${issue.reason}`)}</span></li>)}</ul></AnimatedDisclosure></div> : null}
    {compactMonthDetail ? <AnimatedDisclosure title={t("monthlyDetail", { count: report.months.length })}><div className="overflow-x-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)]"><table className="w-full text-left text-sm [&_th]:p-2 [&_th]:font-medium [&_td]:p-2 [&_tr]:border-b [&_tr:last-child]:border-0"><thead className="bg-[var(--ui-surface-subtle)] text-xs text-[var(--ui-text-muted)]"><tr><th>{t("month")}</th><th className="text-right">{t("closing")}</th><th className="text-right">{t("net")}</th></tr></thead><tbody>{report.months.map(row => <tr key={row.month}><th scope="row">{monthLabel(row.month)}</th><td className="ui-numeric text-right font-medium">{amount(row.closing)}</td><td className="ui-numeric text-right text-[var(--ui-text-secondary)]">{amount(row.remaining)}</td></tr>)}</tbody></table></div></AnimatedDisclosure> : <div className="overflow-x-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)]"><table className="w-full text-left text-sm [&_th]:p-2 [&_th]:font-medium [&_td]:p-2 [&_tr]:border-b [&_tr:last-child]:border-0"><thead className="bg-[var(--ui-surface-subtle)] text-xs text-[var(--ui-text-muted)]"><tr><th>{t("month")}</th><th className="text-right">{t("closing")}</th><th className="text-right">{t("net")}</th></tr></thead><tbody>{report.months.map(row => <tr key={row.month}><th scope="row">{monthLabel(row.month)}</th><td className="ui-numeric text-right font-medium">{amount(row.closing)}</td><td className="ui-numeric text-right text-[var(--ui-text-secondary)]">{amount(row.remaining)}</td></tr>)}</tbody></table></div>}
    <AnimatedDisclosure title={t("dailyDetail", { count: report.daily.length })}>
      <ol className="divide-y divide-[var(--ui-border)] pb-2">{report.daily.map(day => <li key={day.date} className="flex justify-between gap-3 py-2 text-sm"><time className="text-[var(--ui-text-secondary)]">{formatDateOnly(day.date, locale)}</time><span className="ui-numeric font-medium">{amount(day.amount)}</span></li>)}</ol>
    </AnimatedDisclosure>
  </div>;
}

export function ScenarioForecastSection({ data, foundation, captureFx, captureScenario }: { data: FinanceScenarioData; foundation: Foundation; captureFx: ForecastFx; captureScenario: "confirmed" | "planned" }) {
  const t = useTranslations("Finance.forecast.scenarios");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const forecast = useTranslations("Finance.forecast");
  const [editingId, setEditingId] = useState<string | null>("closed");
  const selectedId = params.get("scenarioBase") || data.workspace.base?.id || "";
  const scenarioBaseCurrency = foundation.settings?.base_currency ?? data.workspace.base?.inputs.currency ?? data.displayCurrency;
  const sourceFor = (id: string) => data.workspace.base?.inputs.expected.find(source => source.id === id);
  const describeAssumption = (assumption: ScenarioAssumption) => assumptionSummary(assumption, foundation.currencies, locale, sourceFor, scenarioBaseCurrency, { once: t("once"), monthly: t("monthly") }, t("unknownCurrency"));
  const scenario = editingId && editingId !== "closed" ? data.workspace.scenarios.find(item => item.scenarioId === editingId) ?? null : null;
  const csvHref = `/finance/planning/scenarios/export?scenarioBase=${encodeURIComponent(selectedId)}&scenarioHorizon=${data.horizon}&version=${encodeURIComponent(data.version)}`;
  const disclosure = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 sm:px-4 [&>button]:min-h-12";
  const captureForm = <FinanceActionForm action={saveFinanceCashPlan} label={t("capture") } onSaved={() => router.refresh()}>
    <input type="hidden" name="intent" value="snapshot"/><input type="hidden" name="horizon" value="12"/><input type="hidden" name="fx" value={JSON.stringify(captureFx)}/>
    <FormField label={t("captureCoverage")}><Select name="scenario" defaultValue={captureScenario}><SelectItem value="confirmed">{t("captureConfirmed")}</SelectItem><SelectItem value="planned">{t("capturePlanned")}</SelectItem></Select></FormField>
    <FormField label={t("snapshotName")}><Input name="name" maxLength={120} required/></FormField>
  </FinanceActionForm>;
  return <section className="space-y-4" aria-labelledby="scenario-forecast-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="scenario-forecast-title" className="text-lg font-semibold">{t("title")}</h2><p className="mt-1 max-w-3xl text-sm text-[var(--ui-text-secondary)]">{t("sectionDescription")}</p></div>{data.workspace.baseline ? <a href={csvHref} className="inline-flex min-h-10 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] px-3 text-sm underline underline-offset-4">{t("exportCsv")}</a> : null}</div>
    {data.workspace.sourceChanged ? <p role="status" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] p-3 text-sm text-[var(--ui-warning-text)]">{t("sourceChangedWarning")}</p> : null}
    <form method="get" action="/finance/planning" className={`${panel} grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end`}>
      <input type="hidden" name="mode" value="scenarios"/>
      <FormField label={t("base")}><Select name="scenarioBase" defaultValue={selectedId}><SelectItem value="">{t("chooseBase")}</SelectItem>{data.workspace.bases.map(base => <SelectItem key={base.id} value={base.id}>{base.name} · {formatDateOnly(base.asOf, locale)}</SelectItem>)}</Select></FormField>
      <FormField label={t("horizon")}><Select name="scenarioHorizon" defaultValue={data.horizon}><SelectItem value="6">{t("months6")}</SelectItem><SelectItem value="12">{t("months12")}</SelectItem></Select></FormField>
      <Button type="submit" variant="outline">{t("apply")}</Button>
    </form>
    {foundation.settings?.finalized_at ? <AnimatedDisclosure className={disclosure} title={t("captureDisclosure")}><div className="max-w-xl pb-3"><p className="mb-3 text-xs text-[var(--ui-text-secondary)]">{t("captureHelp")}</p>{captureForm}</div></AnimatedDisclosure> : null}
    {!data.workspace.base ? <p role="status" className={`${panel} p-4 text-sm text-[var(--ui-text-secondary)]`}>{t("noBase")}</p> : <>
      {data.workspace.baseline ? <section className={`${panel} space-y-3 p-4 sm:p-5`}><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{t("baseline")}</h3><span className="text-xs text-[var(--ui-text-muted)]">{data.workspace.base.name} · {t("asOf", { date: formatDateOnly(data.workspace.baseline.asOf, locale) })} · {t("baselineCoverage")}: {forecast(data.workspace.baseline.scenario)}</span></div><p className="text-xs text-[var(--ui-text-secondary)]">{t("reportingCurrencies", { display: data.displayCurrency, base: foundation.settings?.base_currency ?? "" })}</p><ReportSummary report={data.workspace.baseline} currency={foundation.currencies.find(item => item.code === data.workspace.baseline?.currency) ?? data.currency} displayFxMissing={data.displayFx === null && data.workspace.baseline.currency !== data.displayCurrency} locale={locale}/></section> : <p className={`${panel} p-4 text-sm text-[var(--ui-text-secondary)]`}>{t("baselineUnavailable")}</p>}
      {editingId !== "closed" && data.workspace.base && (!editingId || scenario) ? <ScenarioEditor key={`${editingId ?? "new"}:${selectedId}`} data={data} scenario={scenario} initialBaseId={selectedId} onClose={() => setEditingId("closed")} onSaved={() => { setEditingId("closed"); router.refresh(); }}/> : <Button variant="outline" onClick={() => setEditingId(null)}>{t("newScenario")}</Button>}
      <div className="space-y-2"><div className="flex items-baseline justify-between gap-2"><h3 className="font-semibold">{t("savedScenarios")}</h3><span className="text-xs text-[var(--ui-text-muted)]">{data.workspace.scenarios.length}</span></div>
        {!data.workspace.scenarios.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("empty")}</p> : data.workspace.scenarios.map(item => <article key={item.id} id={`scenario-${item.id}`} className={`${panel} scroll-mt-4 p-3 sm:p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="font-medium">{item.name} <span className="text-xs font-normal text-[var(--ui-text-muted)]">· v{item.revision}</span></h4><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{item.baseName} · {t("savedAt", { date: formatDateOnly(item.asOf, locale) })} · {item.reason}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setEditingId(item.scenarioId)}>{item.baseId === selectedId ? t("edit") : t("reviewRebase")}</Button>{item.report ? <Link className="inline-flex min-h-9 items-center rounded-[var(--ui-radius-control)] px-2 text-sm underline underline-offset-4" href={`/finance/planning?mode=scenarios&scenarioBase=${encodeURIComponent(item.baseId)}&scenarioHorizon=${data.horizon}#scenario-${item.id}`}>{t("view")}</Link> : null}</div></div>
          <ul className="mt-3 flex flex-wrap gap-2">{item.assumptions.map(assumption => <li key={assumption.id} className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] px-2.5 py-1 text-xs text-[var(--ui-text-secondary)]">{t(`types.${assumption.type}`)} · {describeAssumption(assumption)}</li>)}</ul>
          {item.report ? <div className="mt-3"><ReportSummary report={item.report} currency={foundation.currencies.find(value => value.code === item.report?.currency) ?? data.currency} displayFxMissing={data.displayFx === null && item.report.currency !== data.displayCurrency} locale={locale} compactMonthDetail/>{data.workspace.baseline && data.workspace.baseline.currency === item.report.currency ? <div className="mt-3"><ScenarioComparison baseline={data.workspace.baseline} scenario={item.report} currency={foundation.currencies.find(value => value.code === item.report?.currency) ?? data.currency} displayFxMissing={data.displayFx === null && item.report.currency !== data.displayCurrency} locale={locale}/></div> : null}</div> : <p className="mt-3 text-sm text-[var(--ui-warning-text)]">{item.rebasePreview ? t("rebasePreviewAvailable") : t("legacyUnavailable")}</p>}
          <AnimatedDisclosure className="mt-2" title={t("versionHistory", { count: item.history.length })}><ol className="divide-y divide-[var(--ui-border)] pb-2">{item.history.map(version => <li key={`${version.revision}:${version.createdAt}`} className="py-2 text-xs"><p className="font-medium">v{version.revision} · {version.name} · {data.workspace.bases.find(base => base.id === version.baseId)?.name ?? version.baseId}</p><p className="mt-1 text-[var(--ui-text-secondary)]">{formatDateOnly(version.createdAt.slice(0, 10), locale)} · {version.reason}</p>{version.assumptions.length ? <ul className="mt-1 list-inside list-disc text-[var(--ui-text-secondary)]">{version.assumptions.map(assumption => <li key={assumption.id}>{t(`types.${assumption.type}`)} · {describeAssumption(assumption)}</li>)}</ul> : <p className="mt-1 text-[var(--ui-text-muted)]">{t("noAssumptions")}</p>}</li>)}</ol></AnimatedDisclosure>
          {item.rebasePreview ? <AnimatedDisclosure className="mt-2" title={t("rebaseChanges", { count: item.rebasePreview.changes.length })}><div className="space-y-2 pb-2 text-xs"><ul className="space-y-1">{item.rebasePreview.changes.map(change => <li key={change.id}><span className="font-medium">{change.label} · {t(`changeStatus.${change.status}`)}</span><span className="ml-1 text-[var(--ui-text-secondary)]">{previewDetails(change.before).map(field => `${t(`previewFields.${field.key}`)}: ${field.value}`).join(" · ") || "—"} → {previewDetails(change.after).map(field => `${t(`previewFields.${field.key}`)}: ${field.value}`).join(" · ") || "—"}</span></li>)}</ul>{item.rebasePreview.cashChanged ? <p className="text-[var(--ui-warning-text)]">{t("cashChanged")}</p> : null}</div></AnimatedDisclosure> : null}
        </article>)}
      </div>
    </>}
  </section>;
}
