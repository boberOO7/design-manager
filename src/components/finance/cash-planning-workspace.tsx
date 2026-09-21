"use client";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { BookmarkPlus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatFinanceAmount } from "@/lib/finance";
import { useLocale, useTranslations } from "next-intl";
import type { getFinanceData } from "@/data/queries/finance";
import type { FinanceForecastData } from "@/data/queries/finance-forecast";
import { saveFinanceCashPlan } from "@/app/(app)/finance/planning/actions";
import { forecastIssueHref } from "@/lib/finance-forecast";
import { financeCategoryLabel } from "@/lib/finance-planning";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectGroup, SelectItem } from "@/components/ui/select";
import { PlanningForecast } from "./planning-forecast";
import { Panel } from "@/components/ui/panel";
import { budgetYearTotal } from "@/lib/finance-forecast";
import { FinanceActionForm } from "./finance-action-form";

type Props = NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & FinanceForecastData & { year: number; invalidFx: boolean };
const tableClass = "w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:p-3 [&_th]:font-medium [&_td]:p-3 [&_tr]:border-b [&_tr]:border-[var(--ui-border)]";
const detailTableClass = `${tableClass} [&_thead]:bg-[var(--ui-surface-muted)] [&_thead]:text-xs [&_thead]:text-[var(--ui-text-secondary)] [&_tbody_tr:last-child]:border-0 [&_td]:tabular-nums`;
const disclosureClass = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 sm:px-4 [&>button]:min-h-14 [&>button]:text-[var(--ui-text)]";

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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
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
  const o = useTranslations("Finance.overview");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") === "budget" ? "budget" : params.get("mode") === "history" || (!params.has("mode") && params.has("snapshot")) ? "history" : "forecast";
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(() => data.categories.find(c => !c.archived_at && data.budget.some(b => b.category_id === c.id))?.id ?? data.categories.find(c => !c.archived_at)?.id ?? "");
  const [snapshotSurface, setSnapshotSurface] = useState<"popover" | "dialog" | null>(null);
  const [snapshotPending, setSnapshotPending] = useState(false);
  const snapshotTrigger = useRef<HTMLButtonElement>(null);
  const [comparisonOpen, setComparisonOpen] = useState(params.get("detail") === "comparison");
  const report = data.report;
  const currency = data.settings?.base_currency ?? "UAH";
  const amount = (value: string | null, code?: string) => {
    const catalogCurrency = data.currencies.find(c => c.code === (code ?? currency));
    return value === null || !catalogCurrency ? "—" : formatFinanceAmount(value, catalogCurrency, locale, code ? "currency" : "decimal");
  };
  const monthLabel = (date: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const categoryLabel = (id: string | null, fallback: string | null = null) => financeCategoryLabel(data.categories.find(c => c.id === id), fallback, key => ft(`planning.defaults.${key}`)) || t("unclassified");
  const href = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); if (key === "snapshot") next.set("mode", "history"); return `/finance/planning?${next}`; };
  const incomplete = Boolean(report?.issues.length || report?.cashIncomplete);
  const foreignCurrencies = [...new Set([...(report?.fx.filter(f => f.source !== "identity").map(f => f.currency) ?? []), ...(report?.items.filter(i => i.currency !== currency).map(i => i.currency) ?? []), ...(report?.issues.filter(i => i.reason === "missing_fx").map(i => i.currency) ?? [])])].sort();
  const navigate = (key: string, value: string) => startTransition(() => router.replace(href(key, value), { scroll: false }));
  const reportingCurrency = data.currencies.find(c => c.code === currency);
  const closeSnapshot = () => { if (!snapshotPending) setSnapshotSurface(null); };
  const snapshotForm = report ? <FinanceActionForm action={saveFinanceCashPlan} label={ft("planning.save")} cancelLabel={ft("planning.cancel")} onCancel={closeSnapshot} onPending={setSnapshotPending} onSaved={result => { setSnapshotSurface(null); if (result.id) router.push(href("snapshot", result.id)); router.refresh(); }}>
    <input type="hidden" name="intent" value="snapshot" /><input type="hidden" name="horizon" value={report.horizon} /><input type="hidden" name="scenario" value={report.scenario} /><input type="hidden" name="fx" value={JSON.stringify(report.fx.filter(f => f.source !== "identity"))} />
    <FormField label={t("snapshotName")}><Input name="name" required maxLength={120} data-dialog-initial-focus /></FormField>
  </FinanceActionForm> : null;
  return <div className="mx-auto w-full min-w-0 max-w-[var(--finance-content-width,80rem)] space-y-6" aria-busy={pending}>
    <PageHeader title={t("title")} description={t("description")} />
    {data.invalidFx ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("invalidManualFx")}</p> : null}
    {!report ? <p className="text-sm">{ft("movements.setupRequired")} <Link href="/finance/accounts" className="underline">{ft("accounts")}</Link></p> : <>
      <nav aria-label={t("modesLabel")} className="flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1 sm:w-fit">
        {(["forecast", "budget", "history"] as const).map(value => <Link key={value} href={href("mode", value)} scroll={false} aria-current={mode === value ? "page" : undefined} className="flex min-h-11 items-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:text-[var(--ui-text)] sm:min-h-9">{t(`modes.${value}`)}</Link>)}
      </nav>
      <div hidden={mode !== "forecast"} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
          <FormField as="div" className="min-w-0 sm:w-44" label={t("horizon")}><Select aria-label={t("horizon")} value={report.horizon} disabled={pending} onValueChange={value => navigate("horizon", value)}>{["3", "6", "year", "12"].map(value => <SelectItem key={value} value={value}>{t(`horizons.${value}`)}</SelectItem>)}</Select></FormField>
          <FormField as="div" className="min-w-0 sm:w-44" label={t("scenario")}><Select aria-label={t("scenario")} value={report.scenario} disabled={pending} onValueChange={value => navigate("scenario", value)}><SelectItem value="confirmed">{t("confirmed")}</SelectItem><SelectItem value="planned">{t("planned")}</SelectItem></Select></FormField>
        </div>
        <Popover.Root open={snapshotSurface === "popover"} onOpenChange={open => { if (!open) closeSnapshot(); else setSnapshotSurface(window.matchMedia("(min-width: 640px)").matches ? "popover" : "dialog"); }}>
          <Popover.Trigger asChild><Button ref={snapshotTrigger} type="button" variant="outline" size="lg" className="gap-2"><BookmarkPlus aria-hidden="true" className="size-4" />{t("saveSnapshot")}</Button></Popover.Trigger>
          <Popover.Portal><Popover.Content align="end" sideOffset={6} collisionPadding={8} onEscapeKeyDown={event => { if (snapshotPending) event.preventDefault(); }} onInteractOutside={event => { if (snapshotPending) event.preventDefault(); }} className="z-[70] w-[min(24rem,calc(100vw-1rem))] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-4 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]">
            {snapshotSurface === "popover" ? snapshotForm : null}
          </Popover.Content></Popover.Portal>
        </Popover.Root>
        <Dialog isOpen={snapshotSurface === "dialog"} title={t("saveSnapshot")} closeLabel={ft("close")} closeDisabled={snapshotPending} returnFocusRef={snapshotTrigger} onRequestClose={closeSnapshot} className="h-auto max-h-[calc(100dvh-1rem)] max-w-md">
          {snapshotSurface === "dialog" ? <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">{snapshotForm}</div> : null}
        </Dialog>
      </div>
      {incomplete || data.overview?.historyIncomplete ? <AnimatedDisclosure className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] px-4 [&>button]:min-h-14" title={`${t("attention", { count: report.issues.length + Number(Boolean(data.overview?.historyIncomplete)) })}${incomplete ? ` · ${o("knownSubtotal")}` : ""}`}>
        <div className="pb-4 text-sm">
          {incomplete ? <p className="max-w-3xl text-[var(--ui-text-secondary)]">{t("incomplete")}</p> : null}
          <ul className="mt-3 divide-y divide-[var(--ui-border)]">
            {data.overview?.historyIncomplete ? <li className="py-2">{o("historyIncomplete")} <Link href="/finance/accounts" className="underline">{ft("accounts")}</Link></li> : null}
            {report.issues.map((issue, index) => <li key={index} className="py-2"><Link href={issue.source === "expected" ? `/finance/expected?item=${issue.id}` : forecastIssueHref(issue)} className="font-medium underline underline-offset-4">{issue.label || t("item")}</Link><span className="block pt-1 text-xs text-[var(--ui-text-secondary)]">{t(`issues.${issue.reason}`)}{issue.date ? ` · ${issue.date}` : ""}{issue.amount !== null ? ` · ${amount(issue.amount, issue.currency)}` : ""}</span></li>)}
          </ul>
        </div>
      </AnimatedDisclosure> : null}
      {data.overview && reportingCurrency ? <PlanningForecast data={data.overview} currency={reportingCurrency} categories={data.categories} onOpenComparison={() => setComparisonOpen(true)} /> : null}
      <div className="space-y-3">
        <AnimatedDisclosure className={disclosureClass} title={`${t("monthlyCash")} · ${t(`horizons.${report.horizon}`)} · ${currency}`}>
          <div className="space-y-3 pb-4">
            <p className="text-xs text-[var(--ui-text-secondary)]">{t("cashBase", { amount: amount(report.cashBase), date: report.asOf })}</p>
            <div className="overflow-x-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)]"><table className={`${detailTableClass.replace("[&_th]:whitespace-nowrap", "").replaceAll("p-3", "p-2")} sm:[&_th]:p-3 sm:[&_td]:p-3`}><caption className="sr-only">{t("cashProjection")}</caption><thead><tr><th scope="col">{t("month")}</th><th scope="col" className="text-right">{t("netRemaining")}</th><th scope="col" className="text-right">{incomplete ? t("knownClosing") : t("closing")}</th></tr></thead>
              <tbody>{report.months.map(row => <tr key={row.month}><th scope="row" className="text-xs text-[var(--ui-text-secondary)] sm:text-sm">{monthLabel(row.month)}</th><td className={`whitespace-nowrap text-right ${row.remaining.startsWith("-") ? "text-[var(--ui-danger-text)]" : /[1-9]/.test(row.remaining) ? "text-[var(--ui-success-text)]" : "text-[var(--ui-text-secondary)]"}`}>{amount(row.remaining)}</td><td className="whitespace-nowrap text-right font-semibold">{amount(row.closing)}</td></tr>)}</tbody></table></div>
          </div>
        </AnimatedDisclosure>
        <div id="planning-comparison" className="scroll-mt-4">
          <AnimatedDisclosure className={disclosureClass} open={comparisonOpen} onOpenChange={setComparisonOpen} title={`${t("comparison")} · ${currency}`}>
            <div className="pb-4">
              <div className="overflow-x-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)]"><table className={`${detailTableClass} [&_td]:whitespace-nowrap [&_td]:text-right`}><caption className="sr-only">{t("comparison")}</caption><thead><tr>{["category", "month", "budget", "actual", "remaining", "full"].map((key, index) => <th key={key} scope="col" className={`${index > 1 ? "text-right" : ""} ${key === "remaining" ? "border-l border-[var(--ui-border)]" : ""}`}>{t(key)}</th>)}</tr></thead>
                <tbody>{report.comparisons.map((row, index) => <tr key={index}><th scope="row" className="min-w-44"><span>{categoryLabel(row.category_id, row.category)}</span><span className="mt-1 block text-xs font-normal text-[var(--ui-text-secondary)]">{ft(`movements.kinds.${row.direction}`)} · {ft(`movements.natures.${row.nature}`)}</span></th><td className="text-xs text-[var(--ui-text-secondary)]">{monthLabel(row.month)}</td><td className="text-[var(--ui-text-secondary)]">{amount(row.budget)}</td><td className="font-medium">{amount(row.actual)}</td><td className="border-l border-[var(--ui-border)] text-[var(--ui-text-secondary)]">{amount(row.remaining)}{row.incomplete ? " *" : ""}</td><td className="font-semibold">{amount(row.full_period)}{row.incomplete ? " *" : ""}</td></tr>)}</tbody></table></div>
              {!report.comparisons.length ? <p className="p-3 text-sm text-[var(--ui-text-secondary)]">{t("empty")}</p> : null}
            </div>
          </AnimatedDisclosure>
        </div>
        <AnimatedDisclosure className={disclosureClass} title={t("datedItems", { count: report.items.length })}>
          <div className="pb-4"><div className="overflow-x-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)]"><table className={detailTableClass}><caption className="sr-only">{t("datedItems", { count: report.items.length })}</caption><thead><tr>{["item", "cashDate", "dueDate", "remaining"].map(key => <th scope="col" key={key} className={key === "remaining" ? "text-right" : ""}>{t(key)}</th>)}</tr></thead><tbody>{report.items.map(item => <tr key={item.id}><th scope="row" className="min-w-52"><Link href={`/finance/expected?item=${item.id}`} className="underline decoration-[var(--ui-border-strong)] underline-offset-4">{item.description || categoryLabel(item.categoryId)}</Link><span className="mt-1 block text-xs font-normal text-[var(--ui-text-secondary)]">{ft(`planning.states.${item.commitment}`)} · {ft(`planning.states.${item.certainty}`)} · {ft(`movements.natures.${item.nature}`)}</span></th><td className="whitespace-nowrap text-xs">{item.date ?? "—"}</td><td className="whitespace-nowrap text-xs">{item.dueDate ?? "—"}</td><td className="whitespace-nowrap text-right font-semibold">{amount(item.amount, item.currency)}</td></tr>)}</tbody></table></div>
            {!report.items.length ? <p className="p-3 text-sm text-[var(--ui-text-secondary)]">{t("empty")}</p> : null}
          </div>
        </AnimatedDisclosure>
        <AnimatedDisclosure className={`rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)] px-3 sm:px-4 [&>button]:min-h-14 ${report.issues.some(issue => issue.reason === "missing_fx") ? "border border-[var(--ui-warning-text)] [&>button]:text-[var(--ui-warning-text)]" : ""}`} title={`${t("fxTitle")}${foreignCurrencies.length ? ` · ${foreignCurrencies.join(", ")} → ${currency}` : ` · ${currency}`}`}>
          <div className="max-w-3xl space-y-4 pb-4 text-sm">
            <p className="text-xs leading-relaxed text-[var(--ui-text-secondary)]">{t("fxHelp")}</p>
            <ul className="divide-y divide-[var(--ui-border)]">{report.fx.map(f => <li key={f.currency} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"><span className="font-medium tabular-nums">{f.currency} → {currency}: {f.rate}</span><span className="text-xs text-[var(--ui-text-secondary)]">{t(`fxSources.${f.source}`)} · {f.effectiveDate}</span></li>)}</ul>
            {foreignCurrencies.length ? <form method="get" className="space-y-3"><input type="hidden" name="year" value={data.year} /><input type="hidden" name="horizon" value={report.horizon} /><input type="hidden" name="scenario" value={report.scenario} />
              <div className="grid gap-3 sm:grid-cols-2">{foreignCurrencies.map(code => <FormField key={code} label={t("manualRate", { currency: code, reporting: currency })}><Input name={`fx_${code}`} inputMode="decimal" defaultValue={report.fx.find(f => f.currency === code && f.source === "manual")?.rate ?? ""} /></FormField>)}</div>
              <Button type="submit" variant="outline">{t("applyFx")}</Button>
            </form> : null}
          </div>
        </AnimatedDisclosure>
        <AnimatedDisclosure className="px-3 sm:px-4 [&>button]:min-h-14" title={t("forecastBasis")}>
          <div className="max-w-3xl space-y-3 pb-4 text-xs leading-relaxed text-[var(--ui-text-secondary)]"><p>{t("period", { from: report.from, through: report.through, asOf: report.asOf })}</p>{report.cutover > report.from ? <p>{t("cutover", { date: report.cutover })}</p> : null}<p>{t("scenarioHelp")}</p><p>{t("cashHelp")}</p><p>{t("definitions")}</p><p>{t("timingHelp")}</p></div>
        </AnimatedDisclosure>
      </div>
      </div>
    </>}
    {report ? <section hidden={mode !== "budget"} className="space-y-4" aria-labelledby="budget-heading"><h2 id="budget-heading" className="text-lg font-semibold">{t("annualBudget")}</h2><details className="text-sm text-[var(--ui-text-secondary)]"><summary className="cursor-pointer">{t("budgetRules")}</summary><p className="mt-2 max-w-3xl">{t("budgetHelp", { currency })}</p></details>
      <form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="mode" value="budget" /><input type="hidden" name="horizon" value={report.horizon} /><input type="hidden" name="scenario" value={report.scenario} />{report.fx.filter(f => f.source === "manual").map(f => <input key={f.currency} type="hidden" name={`fx_${f.currency}`} value={f.rate} />)}<FormField className="w-32" label={t("year")}><Input key={data.year} className="appearance-none tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" name="year" type="number" inputMode="numeric" min={1900} max={9998} defaultValue={data.year} required /></FormField><Button type="submit" variant="outline" size="lg">{t("loadYear")}</Button></form>
      <FormField as="div" className="max-w-xl" label={t("category")}><Select aria-label={t("category")} value={categoryId} onValueChange={setCategoryId} searchPlaceholder={ft("planning.searchCategories")} searchEmptyMessage={ft("planning.noCategories")}>
        {(["incoming", "outgoing"] as const).map(direction => <SelectGroup key={direction} label={ft(`planning.${direction === "incoming" ? "income" : "expenses"}`)}>{data.categories.filter(c => c.direction === direction && (!c.archived_at || c.id === categoryId)).map(c => <SelectItem key={c.id} value={c.id} textValue={`${categoryLabel(c.id)} ${ft(`movements.kinds.${c.direction}`)}`}><span className="flex min-w-0 items-center justify-between gap-3"><span className="truncate">{categoryLabel(c.id)}</span><span className="shrink-0 text-xs font-normal text-[var(--ui-text-muted)]">{ft(`movements.kinds.${c.direction}`)}</span></span></SelectItem>)}</SelectGroup>)}
      </Select></FormField>
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto"><table className={`${tableClass.replaceAll("p-3", "p-2").replace("text-sm", "text-xs")} [&_td]:whitespace-nowrap [&_td]:text-right [&_td]:tabular-nums`}><caption className="sr-only">{t("annualBudget")} · {data.year} · {currency}</caption>
          <thead><tr><th scope="col" className="sticky left-0 z-10 bg-[var(--ui-surface)]">{t("category")}</th>{Array.from({ length: 12 }, (_, i) => <th key={i} scope="col" className="text-right">{new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(data.year, i, 1)))}</th>)}<th scope="col" className="bg-[var(--ui-surface)] text-right sm:sticky sm:right-0">{t("yearTotal")}</th></tr></thead>
          {(["incoming", "outgoing"] as const).map(direction => <tbody key={direction}><tr><th colSpan={14} className="bg-[var(--ui-surface-muted)] text-xs text-[var(--ui-text-secondary)]">{ft(`movements.kinds.${direction}`)} · {currency}</th></tr>{data.categories.filter(c => c.direction === direction && (c.id === categoryId || data.budget.some(b => b.category_id === c.id))).map(c => {
            const row = data.budget.find(b => b.category_id === c.id);
            return <tr key={c.id} className={categoryId === c.id ? "bg-[var(--ui-surface-muted)]" : ""}><th scope="row" className="sticky left-0 z-10 min-w-40 bg-[var(--ui-surface)]"><button type="button" aria-pressed={categoryId === c.id} onClick={() => { setCategoryId(c.id); document.getElementById("budget-editor")?.scrollIntoView({ block: "nearest" }); }} className="min-h-11 text-left underline decoration-[var(--ui-border-strong)] underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{categoryLabel(c.id)}</button>{c.nature !== "operating" ? <span className="block text-xs font-normal text-[var(--ui-text-secondary)]">{ft(`movements.natures.${c.nature}`)}</span> : null}</th>{Array.from({ length: 12 }, (_, i) => <td key={i}>{row?.months ? amount(String(row.months[i])) : "—"}</td>)}<td className="bg-[var(--ui-surface)] font-medium sm:sticky sm:right-0">{row?.months ? amount(budgetYearTotal(row.months.map(String))) : "—"}</td></tr>;
          })}</tbody>)}
        </table></div>
      </Panel>
      <Panel id="budget-editor" className="space-y-4 p-4 sm:p-5"><h3 className="font-semibold">{categoryLabel(categoryId)}</h3>

      {categoryId ? <BudgetEditor key={`${data.year}:${categoryId}`} data={data} categoryId={categoryId} /> : null}
      </Panel>
      <details className="space-y-3"><summary className="cursor-pointer font-medium">{t("budgetHistory")}</summary><p className="text-sm">{t("historyLimit")}</p>{data.history.filter(row => row.category_id === categoryId).map(row => <article key={row.id} className="space-y-1 border-b border-[var(--ui-border)] py-3 text-sm"><p>{t("revision", { revision: row.revision })} · {row.created_at.slice(0, 10)} · {row.reason}</p><p className="break-words text-[var(--ui-text-secondary)]">{row.months.map((value, i) => `${i + 1}: ${amount(String(value))}`).join(" · ")} {row.currency}</p></article>)}</details>
    </section> : null}
    {report ? <section hidden={mode !== "history"} className="space-y-4" aria-labelledby="snapshots-heading"><h2 id="snapshots-heading" className="text-lg font-semibold">{t("snapshots")}</h2><details className="text-sm text-[var(--ui-text-secondary)]"><summary className="cursor-pointer">{t("snapshotRules")}</summary><p className="mt-2 max-w-3xl">{t("snapshotHelp")}</p></details>

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)]">
      <nav aria-label={t("snapshots")} className="max-h-64 min-w-0 overflow-y-auto rounded-[var(--ui-radius-panel)] lg:max-h-[36rem]"><ul className="divide-y divide-[var(--ui-border)] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)]">{data.snapshots.map(row => <li key={row.id}><Link aria-current={data.saved?.id === row.id ? "page" : undefined} className="block break-words px-4 py-3 text-sm hover:bg-[var(--ui-surface-muted)] aria-[current=page]:bg-[var(--ui-surface-muted)]" href={href("snapshot", row.id)} scroll={false}><span className="font-medium">{row.name}</span><span className="mt-1 block text-xs text-[var(--ui-text-secondary)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Kyiv" }).format(new Date(row.created_at))}</span></Link></li>)}</ul></nav>
      {!data.saved ? <Panel className="space-y-3 p-5"><p className="text-sm text-[var(--ui-text-secondary)]">{t(data.snapshots.length ? "selectSnapshot" : "emptySnapshots")}</p><Link href={href("mode", "forecast")} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{t("modes.forecast")}</Link></Panel> : null}
      {data.saved ? <Panel className="min-w-0 space-y-4 p-4 sm:p-5"><h3 className="font-medium">{data.saved.name} · {t(data.saved.forecast.scenario === "confirmed" ? "confirmed" : "planned")}</h3><p className="text-sm">{t("savedContext", { date: data.saved.forecast.asOf, through: data.saved.forecast.through, count: data.saved.forecast.issues.length })}</p>
        {data.saved.comparison === null ? <p className="text-sm">{t("legacySnapshot")}</p> : null}
        <div className="overflow-x-auto"><table className="w-full text-left text-xs sm:text-sm [&_th]:p-2 [&_th]:font-medium [&_td]:p-2 [&_td]:tabular-nums [&_td]:text-right [&_td]:whitespace-nowrap [&_tr]:border-b [&_tr]:border-[var(--ui-border)]"><caption className="sr-only">{t("snapshots")} · {currency}</caption><thead><tr><th scope="col">{t("month")}</th><th scope="col">{t("savedRemaining")}</th><th scope="col">{t("subsequentActual")}</th></tr></thead><tbody>{(data.saved.comparison ?? data.saved.forecast.months.map(row => ({ ...row, actual: null }))).map(row => <tr key={row.month}><th scope="row">{monthLabel(row.month)}</th><td>{amount(row.remaining)}</td><td>{amount(row.actual)}</td></tr>)}</tbody></table></div>
        <p className="text-sm text-[var(--ui-text-secondary)]">{t(`horizons.${data.saved.forecast.horizon}`)} · {currency}</p>
        <details><summary className="cursor-pointer text-sm">{t("savedAssumptions")}</summary><ul className="mt-2 space-y-1 text-sm">{data.saved.forecast.fx.map(f => <li key={f.currency}>{f.currency}: {f.rate} · {t(`fxSources.${f.source}`)} · {f.effectiveDate}</li>)}</ul></details>
      </Panel> : null}
      </div>
    </section> : null}
  </div>;
}
