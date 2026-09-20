"use client";
import Link from "next/link";
import { useState } from "react";
import { formatFinanceAmount, canChartFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceOverview } from "@/lib/finance-overview";
import type { getFinanceData } from "@/data/queries/finance";
import { forecastIssueHref } from "@/lib/finance-forecast";
import { financeCategoryLabel } from "@/lib/finance-planning";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { FormField, Input, inputClassName } from "@/components/ui/form-field";
import { FinanceCashChart } from "./cash-chart";

const table = "w-full text-left text-sm [&_th]:p-3 [&_th]:font-medium [&_td]:p-3 [&_tr]:border-b [&_tr]:border-[var(--ui-border)] [&_td]:tabular-nums";
export function FinanceOverviewWorkspace({ data, categories, currencies, invalidFx }: { data: FinanceOverview; categories: NonNullable<Awaited<ReturnType<typeof getFinanceData>>>["categories"]; currencies: FinanceCurrency[]; invalidFx: boolean }) {
  const t = useTranslations("Finance.overview"), ft = useTranslations("Finance"), f = useTranslations("Finance.forecast");
  const locale = useLocale();
  const [detail, setDetail] = useState<"cash" | "netFlow" | "receivables" | "outgoing" | null>(null);
  const report = data.forecast;
  const reportingCurrency = currencies.find(currency => currency.code === report.currency);
  if (!reportingCurrency) throw new Error("Unknown Finance reporting currency");
  const amount = (value: string | null, code?: string) => {
    const currency = code ? currencies.find(currency => currency.code === code) : reportingCurrency;
    return value === null || !currency ? "—" : formatFinanceAmount(value, currency, locale, code ? "currency" : "decimal");
  };
  const flowsSafe = data.flows.every(row => canChartFinanceAmount(row.amount, reportingCurrency.minor_units));
  const category = (id: string | null, name: string | null) => financeCategoryLabel(categories.find(c => c.id === id), name, key => ft(`planning.defaults.${key}`)) || f("unclassified");
  const upcoming = report.items.filter(i => i.date && i.date <= data.upcomingThrough);
  const outgoing = upcoming.filter(i => i.direction === "outgoing");
  const overdue = report.items.filter(i => i.dueDate && i.dueDate < report.asOf);
  const incomplete = report.cashIncomplete || report.issues.length > 0;
  const foreign = [...new Set([...report.fx.filter(fx => fx.source !== "identity").map(fx => fx.currency), ...report.issues.filter(i => i.reason === "missing_fx").map(i => i.currency), ...data.requiredCurrencies, ...report.items.filter(i => i.currency !== report.currency).map(i => i.currency)])].sort();
  const planningParams = new URLSearchParams({ horizon: report.horizon, scenario: report.scenario });
  report.fx.filter(fx => fx.source !== "identity").forEach(fx => planningParams.set(`fx_${fx.currency}`, fx.rate));
  const planningHref = `/finance/planning?${planningParams}`;
  const itemHref = (id: string) => `/finance/expected?item=${id}`;
  const metrics = [
    { key: "cash" as const, value: report.cashBase, partial: report.cashIncomplete, scope: report.asOf },
    { key: "netFlow" as const, value: data.netFlow, partial: false, scope: `${data.actualFrom} – ${report.asOf}` },
    { key: "receivables" as const, value: data.receivableTotal, partial: data.receivablesIncomplete, scope: t("allDates") },
    { key: "outgoing" as const, value: data.outgoingTotal, partial: data.outgoingIncomplete || incomplete, scope: `${report.asOf} – ${data.upcomingThrough}` },
  ];
  const itemTable = (items: typeof report.items) => <div className="overflow-x-auto"><table className={table}><thead><tr><th scope="col">{f("item")}</th><th scope="col">{f("cashDate")}</th><th scope="col">{f("dueDate")}</th><th scope="col">{f("remaining")}</th></tr></thead><tbody>{items.map(i => <tr key={i.id}><th scope="row"><Link className="underline underline-offset-4" href={itemHref(i.id)}>{i.description || category(i.categoryId, null)}</Link><span className="block text-xs font-normal text-[var(--ui-text-secondary)]">{ft(`movements.kinds.${i.direction}`)} · {ft(`planning.states.${i.certainty}`)} · {ft(`planning.states.${i.commitment}`)} · {ft(`movements.natures.${i.nature}`)}</span></th><td className="whitespace-nowrap">{i.date ?? "—"}</td><td className="whitespace-nowrap">{i.dueDate ?? "—"}{i.dueDate && i.dueDate < report.asOf ? <span className="block text-xs text-[var(--ui-danger-text)]">{t("overdue")}</span> : i.dueDate === report.asOf ? <span className="block text-xs">{t("dueToday")}</span> : null}</td><td className="whitespace-nowrap">{amount(i.reportingAmount)}{i.currency !== report.currency ? <span className="block text-xs text-[var(--ui-text-secondary)]">{amount(i.amount, i.currency)}</span> : null}</td></tr>)}</tbody></table>{!items.length ? <p className="p-3 text-sm text-[var(--ui-text-secondary)]">{t("emptyUpcoming")}</p> : null}</div>;
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6">
    <PageHeader title={t("title")} description={t("scope", { currency: report.currency })} />
    <form method="get" className="flex flex-wrap items-end gap-3">
      <FormField label={t("actualPeriod")}><select aria-label={t("actualPeriod")} name="period" defaultValue={data.period} className={inputClassName}>{["month", "3", "year"].map(p => <option key={p} value={p}>{t(`periods.${p}`)}</option>)}</select></FormField>
      <FormField label={f("horizon")}><select aria-label={f("horizon")} name="horizon" defaultValue={report.horizon} className={inputClassName}>{["3", "6", "year", "12"].map(h => <option key={h} value={h}>{f(`horizons.${h}`)}</option>)}</select></FormField>
      <FormField label={f("scenario")}><select aria-label={f("scenario")} name="scenario" defaultValue={report.scenario} className={inputClassName}><option value="confirmed">{f("confirmed")}</option><option value="planned">{f("planned")}</option></select></FormField>
      {report.fx.filter(fx => fx.source === "manual").map(fx => <input key={fx.currency} type="hidden" name={`fx_${fx.currency}`} value={fx.rate} />)}
      <Button type="submit" variant="outline">{f("apply")}</Button>
    </form>
    {invalidFx ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{f("invalidManualFx")}</p> : null}
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">{metrics.map(m => <button key={m.key} type="button" aria-expanded={detail === m.key} aria-controls="overview-breakdown" onClick={() => setDetail(detail === m.key ? null : m.key)} className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 text-left hover:border-[var(--ui-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2">
      <span className="block text-sm text-[var(--ui-text-secondary)]">{t(m.key)} ↗</span><span className="my-2 block break-words text-xl font-semibold tabular-nums">{amount(m.value)}</span><span className="block text-xs text-[var(--ui-text-secondary)]">{m.partial ? `${t("knownSubtotal")} · ` : ""}{m.scope}</span>
    </button>)}</div>
    {detail ? <Panel id="overview-breakdown" className="min-w-0 space-y-3 p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{t(detail)} · {t("breakdown")}</h2><Button variant="ghost" onClick={() => setDetail(null)}>{t("close")}</Button></div>
      {detail === "cash" ? <div className="overflow-x-auto"><table className={table}><thead><tr><th scope="col">{ft("accounts")}</th><th scope="col">{t("native")}</th><th scope="col">{report.currency}</th></tr></thead><tbody>{data.accounts.map(a => <tr key={a.id}><th scope="row"><Link className="underline" href="/finance/accounts">{a.name}</Link></th><td>{amount(a.native, a.currency)}</td><td>{amount(a.amount)}</td></tr>)}</tbody></table></div> : detail === "receivables" ? <div className="overflow-x-auto"><table className={table}><thead><tr><th scope="col">{f("item")}</th><th scope="col">{f("dueDate")}</th><th scope="col">{f("remaining")}</th></tr></thead><tbody>{data.receivables.map(i => <tr key={i.id}><th scope="row"><Link className="underline" href={itemHref(i.id)}>{i.description || f("item")}</Link></th><td>{i.dueDate ?? "—"}{i.dueDate && i.dueDate < report.asOf ? <span className="block text-xs text-[var(--ui-danger-text)]">{t("overdue")}</span> : null}</td><td>{amount(i.amount)}{i.currency !== report.currency ? <span className="block text-xs">{amount(i.native, i.currency)}</span> : null}</td></tr>)}</tbody></table>{!data.receivables.length ? <p className="p-3 text-sm">{t("emptyReceivables")}</p> : null}</div> : detail === "outgoing" ? itemTable(outgoing) : <div className="overflow-x-auto"><table className={table}><thead><tr><th scope="col">{f("month")}</th><th scope="col">{f("classification")}</th><th scope="col">{report.currency}</th></tr></thead><tbody>{data.flows.map((row, i) => <tr key={i}><th scope="row">{row.month}</th><td>{ft(`movements.natures.${row.nature}`)} · {ft(`movements.kinds.${row.direction}`)}</td><td>{amount(row.amount)}</td></tr>)}</tbody></table></div>}
      <p className="text-sm font-medium">{t("total")}: {amount(metrics.find(m => m.key === detail)?.value ?? null)}{metrics.find(m => m.key === detail)?.partial ? ` · ${t("knownSubtotal")}` : ""}</p>
    </Panel> : null}
    {incomplete || data.historyIncomplete || data.receivablesIncomplete || overdue.length ? <details className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] px-4 py-3 text-sm"><summary className="cursor-pointer font-medium">{t("attention", { count: report.issues.length + overdue.length + Number(data.historyIncomplete) + Number(data.receivablesIncomplete) })}{incomplete ? ` · ${t("incomplete")}` : ""}</summary>
      <ul className="mt-3 space-y-2">
        {data.historyIncomplete ? <li>{t("historyIncomplete")} <Link className="underline" href="/finance/accounts">{ft("accounts")}</Link></li> : null}
        {data.receivablesIncomplete ? <li><a className="underline" href="#overview-fx">{t("receivableFx")}</a></li> : null}
        {overdue.map(i => <li key={i.id}><Link className="underline" href={itemHref(i.id)}>{i.description || f("item")}</Link> · {t("overdue")} · {i.dueDate} · {amount(i.amount, i.currency)}</li>)}
        {report.issues.map((i, index) => <li key={index}><Link className="underline" href={i.source === "expected" ? itemHref(i.id) : forecastIssueHref(i)}>{i.label || f("item")}</Link> · {f(`issues.${i.reason}`)}{i.date ? ` · ${i.date}` : ""}</li>)}
      </ul>
    </details> : null}
    <Panel className="min-w-0 space-y-4 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold">{t("cashChart")}</h2><p className="text-right text-sm"><span className="text-[var(--ui-text-secondary)]">{t("lowPoint")}{incomplete ? ` · ${t("incomplete")}` : ""}</span><span className={`block font-medium tabular-nums ${data.lowPoint.amount.startsWith("-") ? "text-[var(--ui-danger-text)]" : ""}`}>{amount(data.lowPoint.amount)} · {data.lowPoint.date}</span></p></div>
      <FinanceCashChart data={data} currency={reportingCurrency} />
      <details className="text-sm"><summary className="cursor-pointer text-[var(--ui-text-secondary)]">{t("valuation")}</summary><p className="mt-2 text-[var(--ui-text-secondary)]">{t("valuationHelp")}</p></details>
    </Panel>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <Panel className="min-w-0 space-y-4 p-4 sm:p-5"><h2 className="text-lg font-semibold">{t("flows")}</h2><p className="text-xs text-[var(--ui-text-secondary)]">{data.actualFrom} – {report.asOf} · {ft("movements.natures.operating")}</p>
        {!flowsSafe ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("chartScale")}</p> : null}
        <div className="space-y-5">{[...new Set(data.flows.map(r => r.month))].map(month => <div key={month} className="space-y-2"><h3 className="text-sm font-medium">{new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`))}</h3>{["incoming", "outgoing"].map(direction => {
          const value = data.flows.find(r => r.month === month && r.direction === direction && r.nature === "operating")?.amount ?? "0";
          const max = Math.max(1, ...data.flows.filter(r => r.nature === "operating").map(r => Math.abs(Number(r.amount))));
          return <div key={direction} className="space-y-1"><div className="flex justify-between gap-2 text-xs"><span>{ft(`movements.kinds.${direction}`)}</span><span className="tabular-nums">{amount(value)}</span></div>{flowsSafe ? <div aria-hidden="true" className="h-2 bg-[var(--ui-surface-muted)]"><div className={`h-2 ${direction === "incoming" ? "bg-[var(--ui-success-accent)]" : "bg-[var(--ui-text-muted)]"}`} style={{ width: `${Math.abs(Number(value)) / max * 100}%` }} /></div> : null}</div>;
        })}</div>)}</div>
        {!data.flows.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("emptyFlows")}</p> : null}
        {data.flows.some(r => r.nature !== "operating") ? <ul className="space-y-2 border-t border-[var(--ui-border)] pt-3 text-xs">{data.flows.filter(r => r.nature !== "operating").map((r, i) => <li key={i} className="flex flex-wrap justify-between gap-2"><span>{r.month.slice(0, 7)} · {ft(`movements.natures.${r.nature}`)} · {ft(`movements.kinds.${r.direction}`)}</span><span className="tabular-nums">{amount(r.amount)}</span></li>)}</ul> : null}
        <Button variant="ghost" onClick={() => { setDetail("netFlow"); window.scrollTo({ top: 0, behavior: "instant" }); }}>{t("breakdown")}</Button>
      </Panel>
      <Panel className="min-w-0 space-y-3 p-4 sm:p-5"><h2 className="text-lg font-semibold">{t("budgetComparison")}</h2><p className="text-xs text-[var(--ui-text-secondary)]">{report.from} – {report.through} · {report.currency}</p>
        <div className="overflow-x-auto"><table className={table}><caption className="sr-only">{t("budgetComparison")}</caption><thead><tr>{["category", "budget", "full", "actual"].map(key => <th key={key} scope="col">{f(key)}{key === "full" && incomplete ? <span className="block text-xs font-normal">{t("incomplete")}</span> : null}</th>)}<th scope="col">{t("variance")}</th></tr></thead><tbody>{data.categories.slice(0, 6).map((c, i) => <tr key={i}><th scope="row">{category(c.id, c.name)}<span className="block text-xs font-normal text-[var(--ui-text-secondary)]">{ft(`movements.kinds.${c.direction}`)} · {ft(`movements.natures.${c.nature}`)}</span></th><td>{amount(c.budget)}</td><td>{amount(c.forecast)}{c.incomplete ? " *" : ""}</td><td>{amount(c.actual)}</td><td>{amount(c.variance)}{c.incomplete ? " *" : ""}</td></tr>)}</tbody></table></div>
        {!data.categories.length ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("emptyBudget")}</p> : null}
        <Link className="inline-block text-sm underline underline-offset-4" href={`${planningHref}&detail=comparison#planning-comparison`}>{t("budgetDetails")}</Link>
      </Panel>
    </div>
    <Panel className="min-w-0 space-y-3 p-4 sm:p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">{t("upcoming")}</h2><span className="text-xs text-[var(--ui-text-secondary)]">{report.asOf} – {data.upcomingThrough}</span></div>{itemTable(upcoming.slice(0, 8))}{upcoming.length > 8 ? <details><summary className="cursor-pointer text-sm">{t("allUpcoming", { count: upcoming.length })}</summary>{itemTable(upcoming)}</details> : null}</Panel>
    <details id="overview-fx" className="space-y-3 text-sm"><summary className="cursor-pointer font-medium">{f("fxTitle")}</summary><p className="text-[var(--ui-text-secondary)]">{f("fxHelp")}</p><ul>{report.fx.map(fx => <li key={fx.currency}>{fx.currency} → {report.currency}: {fx.rate} · {f(`fxSources.${fx.source}`)} · {fx.effectiveDate}</li>)}</ul>
      {foreign.length ? <form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="period" value={data.period} /><input type="hidden" name="horizon" value={report.horizon} /><input type="hidden" name="scenario" value={report.scenario} />{foreign.map(code => <FormField key={code} label={f("manualRate", { currency: code, reporting: report.currency })}><Input name={`fx_${code}`} inputMode="decimal" defaultValue={report.fx.find(fx => fx.currency === code && fx.source === "manual")?.rate ?? ""} /></FormField>)}<Button variant="outline" type="submit">{f("applyFx")}</Button></form> : null}
    </details>
  </div>;
}
