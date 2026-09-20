"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatFinanceDecimal } from "@/lib/finance";
import { useLocale, useTranslations } from "next-intl";
import type { getFinanceData } from "@/data/queries/finance";
import type { FinanceForecastData } from "@/data/queries/finance-forecast";
import { saveFinanceCashPlan } from "@/app/(app)/finance/planning/actions";
import { forecastIssueHref } from "@/lib/finance-forecast";
import { financeCategoryLabel } from "@/lib/finance-planning";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea, inputClassName } from "@/components/ui/form-field";
import { FinanceActionForm } from "./finance-action-form";

type Props = NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & FinanceForecastData & { year: number; invalidFx: boolean };
const tableClass = "w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:p-3 [&_th]:font-medium [&_td]:p-3 [&_tr]:border-b [&_tr]:border-[var(--ui-border)]";

function BudgetEditor({ data, categoryId }: { data: Props; categoryId: string }) {
  const t = useTranslations("Finance.forecast");
  const locale = useLocale();
  const router = useRouter();
  const current = data.budget.find(row => row.category_id === categoryId);
  const [months, setMonths] = useState(() => current?.months?.map(String) ?? Array.from({ length: 12 }, () => "0"));
  const [repeat, setRepeat] = useState("");
  const [generation, setGeneration] = useState(0);
  const [saved, setSaved] = useState(false);
  return <FinanceActionForm key={generation} action={saveFinanceCashPlan} label={t("approveBudget")} onSaved={() => { setSaved(true); setGeneration(v => v + 1); router.refresh(); }}>
    <input type="hidden" name="intent" value="budget" /><input type="hidden" name="categoryId" value={categoryId} />
    <input type="hidden" name="year" value={data.year} /><input type="hidden" name="revision" value={current?.revision ?? 0} />
    <p className="text-sm text-[var(--ui-text-secondary)]">{t("revision", { revision: current?.revision ?? 0 })} · {data.settings?.base_currency}</p>
    <div className="flex flex-wrap items-end gap-3"><FormField label={t("repeatAmount")}><Input inputMode="decimal" value={repeat} onChange={e => setRepeat(e.target.value)} /></FormField>
      <Button type="button" variant="outline" onClick={() => { setMonths(Array.from({ length: 12 }, () => repeat)); setSaved(false); }} disabled={!/^\d{1,10}(?:[.,]\d{1,4})?$/.test(repeat)}>{t("fillYear")}</Button></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {months.map((value, index) => <FormField key={index} label={new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(data.year, index, 1)))}>
        <Input name="months" inputMode="decimal" required value={value} onChange={e => { setMonths(months.map((v, i) => i === index ? e.target.value : v)); setSaved(false); }} />
      </FormField>)}
    </div>
    <FormField label={t("revisionNote")}><Textarea name="reason" required maxLength={2000} /></FormField>
    {saved ? <p role="status" className="text-sm">{t("budgetSaved")}</p> : null}
  </FinanceActionForm>;
}

export function FinanceCashPlanningWorkspace(data: Props) {
  const t = useTranslations("Finance.forecast");
  const ft = useTranslations("Finance");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [categoryId, setCategoryId] = useState(() => data.categories.find(c => !c.archived_at)?.id ?? "");
  const [snapshotForm, setSnapshotForm] = useState(0);
  const report = data.report;
  const currency = data.settings?.base_currency ?? "UAH";
  const digits = data.currencies.find(c => c.code === currency)?.minor_units ?? 2;
  const amount = (value: string | null) => value === null ? "—" : formatFinanceDecimal(value, locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const monthLabel = (date: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const categoryLabel = (id: string | null, fallback: string | null = null) => financeCategoryLabel(data.categories.find(c => c.id === id), fallback, key => ft(`planning.defaults.${key}`)) || t("unclassified");
  const href = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); return `/finance/planning?${next}`; };
  const incomplete = Boolean(report?.issues.length || report?.cashIncomplete);
  const foreignCurrencies = [...new Set([...(report?.fx.filter(f => f.source !== "identity").map(f => f.currency) ?? []), ...(report?.items.filter(i => i.currency !== currency).map(i => i.currency) ?? []), ...(report?.issues.filter(i => i.reason === "missing_fx").map(i => i.currency) ?? [])])].sort();
  return <div className="mx-auto w-full max-w-4xl space-y-8">
    <PageHeader title={t("title")} description={t("description")} />
    {data.invalidFx ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("invalidManualFx")}</p> : null}
    {!report ? <p className="text-sm">{ft("movements.setupRequired")} <Link href="/finance/accounts" className="underline">{ft("accounts")}</Link></p> : <>
      <form method="get" className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="year" value={data.year} />
        <FormField label={t("horizon")}><select aria-label={t("horizon")} className={inputClassName} name="horizon" defaultValue={report.horizon}>{["3", "6", "year", "12"].map(value => <option key={value} value={value}>{t(`horizons.${value}`)}</option>)}</select></FormField>
        <FormField label={t("scenario")}><select aria-label={t("scenario")} className={inputClassName} name="scenario" defaultValue={report.scenario}><option value="confirmed">{t("confirmed")}</option><option value="planned">{t("planned")}</option></select></FormField>
        {report.fx.filter(f => f.source === "manual").map(f => <input key={f.currency} type="hidden" name={`fx_${f.currency}`} value={f.rate} />)}
        <Button type="submit" variant="outline">{t("apply")}</Button>
      </form>
      <p className="text-sm text-[var(--ui-text-secondary)]">{t("scenarioHelp")} {t("period", { from: report.from, through: report.through, asOf: report.asOf })}</p>
      {report.cutover > report.from ? <p role="status" className="text-sm">{t("cutover", { date: report.cutover })}</p> : null}
      {incomplete ? <p role="status" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] p-4 text-sm">{t("incomplete")}</p> : null}
      <section className="space-y-3" aria-labelledby="cash-heading"><h2 id="cash-heading" className="text-lg font-semibold">{t("cashProjection")} · {currency}</h2>
        <p className="text-sm">{t("cashBase", { amount: amount(report.cashBase), date: report.asOf })} {t("cashHelp")}</p>
        <div className="overflow-x-auto"><table className={tableClass}><caption className="sr-only">{t("cashProjection")}</caption><thead><tr><th scope="col">{t("month")}</th><th scope="col">{t("netRemaining")}</th><th scope="col">{incomplete ? t("knownClosing") : t("closing")}</th></tr></thead>
          <tbody>{report.months.map(row => <tr key={row.month}><th scope="row">{monthLabel(row.month)}</th><td className="tabular-nums">{amount(row.remaining)}</td><td className="tabular-nums">{amount(row.closing)}</td></tr>)}</tbody></table></div>
      </section>
      <section className="space-y-3" aria-labelledby="compare-heading"><h2 id="compare-heading" className="text-lg font-semibold">{t("comparison")} · {currency}</h2><p className="text-sm text-[var(--ui-text-secondary)]">{t("definitions")}</p>
        <div className="overflow-x-auto"><table className={tableClass}><caption className="sr-only">{t("comparison")}</caption><thead><tr>{["month", "category", "budget", "actual", "remaining", "full"].map(key => <th key={key} scope="col">{t(key)}</th>)}</tr></thead>
          <tbody>{report.comparisons.map((row, index) => <tr key={index}><td>{monthLabel(row.month)}</td><th scope="row">{categoryLabel(row.category_id, row.category)}<span className="block text-xs font-normal text-[var(--ui-text-secondary)]">{ft(`movements.kinds.${row.direction}`)} · {ft(`movements.natures.${row.nature}`)}</span></th><td className="tabular-nums">{amount(row.budget)}</td><td className="tabular-nums">{amount(row.actual)}</td><td className="tabular-nums">{amount(row.remaining)}{row.incomplete ? " *" : ""}</td><td className="tabular-nums">{amount(row.full_period)}{row.incomplete ? " *" : ""}</td></tr>)}</tbody></table></div>
        {!report.comparisons.length ? <p className="text-sm">{t("empty")}</p> : null}
      </section>
      <details className="space-y-3"><summary className="cursor-pointer font-medium">{t("datedItems", { count: report.items.length })}</summary><p className="text-sm text-[var(--ui-text-secondary)]">{t("timingHelp")}</p>
        <div className="overflow-x-auto"><table className={tableClass}><thead><tr>{["item", "cashDate", "dueDate", "remaining", "classification"].map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead><tbody>{report.items.map(item => <tr key={item.id}><th scope="row"><Link href={item.projectId ? `/projects/${item.projectId}?view=finance` : "/finance/expected"} className="underline">{item.description || categoryLabel(item.categoryId)}</Link></th><td>{item.date ?? "—"}</td><td>{item.dueDate ?? "—"}</td><td>{item.amount} {item.currency}</td><td>{ft(`planning.states.${item.commitment}`)} · {ft(`planning.states.${item.certainty}`)} · {ft(`movements.natures.${item.nature}`)}</td></tr>)}</tbody></table></div>
      </details>
      <section className="space-y-3" aria-labelledby="attention-heading"><h2 id="attention-heading" className="text-lg font-semibold">{t("attention", { count: report.issues.length })}</h2>
        {!report.issues.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("noIssues")}</p> : <ul className="divide-y divide-[var(--ui-border)]">{report.issues.map((issue, index) => <li key={index} className="py-3 text-sm"><Link href={forecastIssueHref(issue)} className="font-medium underline">{issue.label || t("item")}</Link> · {t(`issues.${issue.reason}`)}{issue.date ? ` · ${issue.date}` : ""}{issue.amount !== null ? ` · ${issue.amount} ${issue.currency}` : ""}</li>)}</ul>}
      </section>
      <details className="space-y-4"><summary className="cursor-pointer font-medium">{t("fxTitle")}</summary><p className="text-sm text-[var(--ui-text-secondary)]">{t("fxHelp")}</p>
        <ul className="space-y-1 text-sm">{report.fx.map(f => <li key={f.currency}>{f.currency} → {currency}: {f.rate} · {t(`fxSources.${f.source}`)} · {f.effectiveDate}</li>)}</ul>
        {foreignCurrencies.length ? <form method="get" className="space-y-3"><input type="hidden" name="year" value={data.year} /><input type="hidden" name="horizon" value={report.horizon} /><input type="hidden" name="scenario" value={report.scenario} />
          {foreignCurrencies.map(code => <FormField key={code} label={t("manualRate", { currency: code, reporting: currency })}><Input name={`fx_${code}`} inputMode="decimal" defaultValue={report.fx.find(f => f.currency === code && f.source === "manual")?.rate ?? ""} /></FormField>)}
          <Button type="submit" variant="outline">{t("applyFx")}</Button>
        </form> : null}
      </details>
    </>}
    {report ? <section className="space-y-4 border-t border-[var(--ui-border)] pt-6" aria-labelledby="budget-heading"><h2 id="budget-heading" className="text-lg font-semibold">{t("annualBudget")}</h2><p className="text-sm text-[var(--ui-text-secondary)]">{t("budgetHelp", { currency })}</p>
      <form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="horizon" value={report.horizon} /><input type="hidden" name="scenario" value={report.scenario} />{report.fx.filter(f => f.source === "manual").map(f => <input key={f.currency} type="hidden" name={`fx_${f.currency}`} value={f.rate} />)}<FormField label={t("year")}><Input key={data.year} name="year" type="number" min={1900} max={9998} defaultValue={data.year} required /></FormField><Button type="submit" variant="outline">{t("loadYear")}</Button></form>
      <FormField label={t("category")}><select aria-label={t("category")} className={inputClassName} value={categoryId} onChange={e => setCategoryId(e.target.value)}>{data.categories.filter(c => !c.archived_at).map(c => <option key={c.id} value={c.id}>{categoryLabel(c.id)} · {ft(`movements.kinds.${c.direction}`)}</option>)}</select></FormField>
      {categoryId ? <BudgetEditor key={`${data.year}:${categoryId}`} data={data} categoryId={categoryId} /> : null}
      <details className="space-y-3"><summary className="cursor-pointer font-medium">{t("budgetHistory")}</summary><p className="text-sm">{t("historyLimit")}</p>{data.history.filter(row => row.category_id === categoryId).map(row => <article key={row.id} className="space-y-1 border-b border-[var(--ui-border)] py-3 text-sm"><p>{t("revision", { revision: row.revision })} · {row.created_at.slice(0, 10)} · {row.reason}</p><p className="break-words text-[var(--ui-text-secondary)]">{row.months.map((value, i) => `${i + 1}: ${amount(String(value))}`).join(" · ")} {row.currency}</p></article>)}</details>
    </section> : null}
    {report ? <section className="space-y-4 border-t border-[var(--ui-border)] pt-6" aria-labelledby="snapshots-heading"><h2 id="snapshots-heading" className="text-lg font-semibold">{t("snapshots")}</h2><p className="text-sm text-[var(--ui-text-secondary)]">{t("snapshotHelp")}</p>
      <FinanceActionForm key={snapshotForm} action={saveFinanceCashPlan} label={t("saveSnapshot")} onSaved={result => { setSnapshotForm(v => v + 1); if (result.id) router.push(href("snapshot", result.id)); router.refresh(); }}>
        <input type="hidden" name="intent" value="snapshot" /><input type="hidden" name="horizon" value={report.horizon} /><input type="hidden" name="scenario" value={report.scenario} /><input type="hidden" name="fx" value={JSON.stringify(report.fx.filter(f => f.source !== "identity"))} />
        <FormField label={t("snapshotName")}><Input name="name" required maxLength={120} /></FormField>
      </FinanceActionForm>
      <ul className="space-y-2 text-sm">{data.snapshots.map(row => <li key={row.id}><Link className="underline" href={href("snapshot", row.id)}>{row.name}</Link> · {row.created_at.slice(0, 16).replace("T", " ")}</li>)}</ul>
      {data.saved ? <div className="space-y-3"><h3 className="font-medium">{data.saved.name} · {t(data.saved.forecast.scenario === "confirmed" ? "confirmed" : "planned")}</h3><p className="text-sm">{t("savedContext", { date: data.saved.forecast.asOf, through: data.saved.forecast.through, count: data.saved.forecast.issues.length })}</p>
        {data.saved.comparison === null ? <p className="text-sm">{t("legacySnapshot")}</p> : null}
        <div className="overflow-x-auto"><table className={tableClass}><thead><tr><th>{t("month")}</th><th>{t("savedRemaining")}</th><th>{t("subsequentActual")}</th></tr></thead><tbody>{(data.saved.comparison ?? data.saved.forecast.months.map(row => ({ ...row, actual: null }))).map(row => <tr key={row.month}><th scope="row">{monthLabel(row.month)}</th><td>{amount(row.remaining)}</td><td>{amount(row.actual)}</td></tr>)}</tbody></table></div>
        <details><summary className="cursor-pointer text-sm">{t("savedAssumptions")}</summary><ul className="mt-2 space-y-1 text-sm">{data.saved.forecast.fx.map(f => <li key={f.currency}>{f.currency}: {f.rate} · {t(`fxSources.${f.source}`)} · {f.effectiveDate}</li>)}</ul></details>
      </div> : null}
    </section> : null}
  </div>;
}
