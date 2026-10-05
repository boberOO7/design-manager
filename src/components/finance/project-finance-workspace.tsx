"use client";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, History, Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { formatProjectFinanceMoney, projectAgreementRemaining, type ProjectFinanceDisplay, type projectContractSummary, type ProjectFinanceTab } from "@/lib/finance-project-view";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceProject } from "@/app/(app)/finance/project-actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";
import { FinanceVatControls } from "./project-value-builder";
import { FinanceExpectedWorkspace } from "./expected-workspace";
import { formatFinanceAmount, formatFinanceDecimal } from "@/lib/finance";
import { projectStreams } from "@/lib/finance-projects";
import { formatDateOnly } from "@/lib/utils";
import type { FinancePlanningData, FinanceProjectData, getFinanceData } from "@/data/queries/finance";
import type { FinanceDisplayCurrency } from "@/lib/finance-display-currency";
import type { FinanceProjectCash } from "@/data/queries/finance-project-cash";
import { DisplayCurrencySelect } from "./display-currency-select";
import { ProjectOrdersManager } from "./project-orders-manager";

type Props = NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & {
  planning: FinancePlanningData | null; tab: ProjectFinanceTab; itemId?: string; children?: ReactNode; cashData?: FinanceProjectCash | null;
  displayCurrency: FinanceDisplayCurrency; display?: ProjectFinanceDisplay; summary: ReturnType<typeof projectContractSummary>;
  project: FinanceProjectData; stream: typeof projectStreams[number]; today: string; page: number; creditPage: number; filter: string;
};
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5";

function TermsForm({ data, onSaved, onPending }: { data: Props; onSaved: () => void; onPending: (v: boolean) => void }) {
  const t = useTranslations("Finance"), locale = useLocale();
  const current = data.project.terms.find((v) => v.stream === "supervision");
  const [mode, setMode] = useState(current?.mode ?? "monthly");
  const [currency, setCurrency] = useState(current?.currency ?? data.settings?.base_currency ?? "UAH");
  const [amount, setAmount] = useState(String(current?.amount ?? ""));
  const [vatRate, setVatRate] = useState<string | null>(current?.vat_rate == null ? null : String(current.vat_rate));
  const [priceBasis, setPriceBasis] = useState<"net" | "gross" | null>(current?.price_basis === "net" || current?.price_basis === "gross" ? current.price_basis : null);
  const [from, setFrom] = useState(current ? "" : `${data.today.slice(0, 7)}-01`), [through, setThrough] = useState("");
  return <FinanceActionForm action={saveFinanceProject} label={t("planning.save")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value="terms"/><input type="hidden" name="projectId" value={data.project.projectId}/><input type="hidden" name="stream" value="supervision"/><input type="hidden" name="revision" value={current?.revision ?? 0}/><input type="hidden" name="vatRate" value={vatRate ?? ""}/><input type="hidden" name="priceBasis" value={priceBasis ?? ""}/>
    <FormField label={t("project.arrangement")}><Select name="mode" aria-label={t("project.arrangement")} value={mode} onValueChange={setMode}>{["monthly", "per_visit", "custom", "stopped"].map((v) => <SelectItem key={v} value={v}>{t(`project.modes.${v}`)}</SelectItem>)}</Select></FormField>
    <div className="grid gap-4 sm:grid-cols-2">
      {["custom", "stopped"].includes(mode) ? <input type="hidden" name="amount" value=""/> : <FormField label={t("project.rate")}><Input name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required/></FormField>}
      <FormField label={t("project.currency")}><FinanceCurrencySelect name="currency" currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={currency} onValueChange={setCurrency}/></FormField>
      {mode !== "stopped" ? <div className="sm:col-span-2"><FinanceVatControls amount={mode === "custom" ? "" : amount} vatRate={vatRate} priceBasis={priceBasis} digits={data.currencies.find((item) => item.code === currency)?.minor_units ?? 2} money={(value) => { const selected = data.currencies.find((item) => item.code === currency); return selected ? formatFinanceAmount(value, selected, locale) : value; }} onRateChange={(rate) => { setVatRate(rate); if (rate !== null && !priceBasis) setPriceBasis("net"); else if (rate === null) setPriceBasis(null); }} onBasisChange={setPriceBasis} labels={{ vat: t("builder.vat"), rate: t("builder.vatRate"), custom: t("builder.vatOther"), none: t("builder.vatNone"), basis: t("builder.priceBasis"), net: t("builder.netShort"), gross: t("builder.grossShort"), customRate: t("builder.customRate") }}/></div> : null}
      <FormField label={t("project.effectiveFrom")}><DatePicker name="effectiveFrom" aria-label={t("project.effectiveFrom")} value={from} onValueChange={setFrom} locale={locale}/></FormField><FormField label={t("project.effectiveThrough")}><DatePicker name="effectiveThrough" aria-label={t("project.effectiveThrough")} value={through} onValueChange={setThrough} locale={locale}/></FormField>
    </div>
    <p className="text-xs text-[var(--ui-text-muted)]">{t("project.monthHelp")}</p>
    {current ? <p className="text-xs text-[var(--ui-text-muted)]">{t("project.amendHelp")}</p> : null}
    <FormField label={t("project.reason")}><Textarea name="reason" rows={2} required maxLength={2000}/></FormField>
  </FinanceActionForm>;
}

function MonthsForm({ data, onSaved, onPending }: { data: Props; onSaved: () => void; onPending: (v: boolean) => void }) {
  const t = useTranslations("Finance");
  const [from, setFrom] = useState(data.today.slice(0, 7)), [through, setThrough] = useState(data.today.slice(0, 7));
  return <FinanceActionForm action={saveFinanceProject} label={t("project.generate")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value="months"/><input type="hidden" name="projectId" value={data.project.projectId}/>
    <input type="hidden" name="from" value={`${from}-01`}/><input type="hidden" name="through" value={`${through}-01`}/>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("project.fromMonth")}><Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} required/></FormField><FormField label={t("project.throughMonth")}><Input type="month" value={through} onChange={(e) => setThrough(e.target.value)} required/></FormField></div>
    <p className="text-sm text-[var(--ui-text-secondary)]">{t("project.generateHelp")}</p>
  </FinanceActionForm>;
}

export function ProjectFinanceWorkspace(props: Props) {
  const router = useRouter();
  const t = useTranslations("Finance"), locale = useLocale();
  const [manager, setManager] = useState<string | null>(null);
  const [editor, setEditor] = useState<"supervision" | "months" | null>(null), [historyOpen, setHistoryOpen] = useState(false), [pending, setPending] = useState(false);
  const supervision = props.project.terms.find(item => item.stream === "supervision");
  const confirmed = props.project.orders.filter(order => order.status === "confirmed");
  const draftCount = props.project.orders.filter(order => order.status === "draft").length;
  const totals = props.project.totals.filter(total => total.stream === "design");
  const approximate = totals.some(total => total.currency !== props.displayCurrency);
  const money = (amount: string | number | null, code: string | null) => {
    const currency = props.currencies.find(item => item.code === code);
    return currency && amount !== null ? formatFinanceAmount(amount, currency, locale) : "—";
  };
  const displayMoney = (amount: string | number | null, code: string | null) => formatProjectFinanceMoney(amount, props.currencies.find(item => item.code === code), props.display, locale);
  const summaryMoney = (amount: string | number | null | undefined, code: string | null, estimated = false) => {
    if (amount == null || !code || !props.currencies.some(item => item.code === code)) return "—";
    const [before, after] = money(amount, code).split(code);
    return <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5">
      {estimated ? <span>≈</span> : null}
      {before.trim() ? <span className="whitespace-nowrap">{before.trim()}</span> : null}
      <span>{code}</span>
      {after?.trim() ? <span className="whitespace-nowrap">{after.trim()}</span> : null}
    </span>;
  };
  if (!props.settings?.finalized_at) return <section className={panel}>{t("movements.setupRequired")} <Link className="underline" href="/finance/accounts">{t("movements.setupLink")}</Link></section>;
  const href = (tab: ProjectFinanceTab, stream = "design") => `/projects/${props.project.projectId}?view=finance&financeTab=${tab}${tab === "payments" ? `&stream=${stream}` : ""}`;
  const next = props.project.nextPayment;
  const completion = props.summary && Number(props.summary.gross) > 0
    ? Math.min(100, Math.max(0, (1 - Number(props.summary.remaining) / Number(props.summary.gross)) * 100)) : null;
  const pricePerArea = props.summary && Number(props.project.area) > 0
    ? Number(props.summary.gross) / Number(props.project.area) : null;
  const incomeSelector = <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto sm:flex-nowrap"><h2 className="shrink-0 text-base font-semibold sm:text-lg">{t("planning.filtersList.incoming")}</h2><Select aria-label={t("orders.category")} variant="secondary" width="content" contentMinWidth="natural" className="w-full min-w-[min(17rem,100%)] sm:w-fit" value={props.stream} onValueChange={stream => router.push(href("payments", stream), { scroll: false })}>{projectStreams.filter(stream => stream !== "expenses").map(stream => <SelectItem key={stream} value={stream}>{t(stream === "design" ? "orders.contractual" : `project.streams.${stream}`)}</SelectItem>)}</Select></div>;
  const incomeActions = props.tab === "payments" && props.stream === "supervision" ? <><Button size="compact" variant="outline" onClick={() => setEditor("supervision")}>{t("project.editSupervision")}</Button>{props.project.termHistory.some(term => term.mode === "monthly") ? <Button size="compact" variant="ghost" onClick={() => setEditor("months")}>{t("project.generate")}</Button> : null}{supervision ? <Button size="compact" variant="ghost" onClick={() => setHistoryOpen(true)}><History aria-hidden="true" className="size-4"/>{t("project.history")}</Button> : null}</> : undefined;
  const incomeDetails = props.tab === "payments" && props.stream !== "design" && ((props.stream === "supervision" && supervision) || props.project.totals.some(total => total.stream === props.stream)) ? <AnimatedDisclosure title={t("projectWorkspace.categoryDetails")}><div className="space-y-3 pb-2 text-sm text-[var(--ui-text-secondary)]">{supervision && props.stream === "supervision" ? <><p>{t(`project.modes.${supervision.mode}`)} · {supervision.effective_from ? formatDateOnly(supervision.effective_from,locale) : "—"} — {supervision.effective_through ? formatDateOnly(supervision.effective_through,locale) : t("project.openEnded")}</p>{supervision.vat_rate !== null && supervision.amount !== null ? <p className="text-xs">{t("project.vatBreakdown", { net: displayMoney(supervision.net_amount,supervision.currency),vat:displayMoney(supervision.vat_amount,supervision.currency),gross:displayMoney(supervision.gross_amount,supervision.currency) })}</p> : null}</> : null}{props.project.totals.filter(total => total.stream === props.stream).map(total => <dl key={total.currency} className="flex flex-wrap gap-x-8 gap-y-3">{([["collected", total.collected_amount], ["outstanding", total.outstanding_amount], ["planned", total.planned_amount]] as const).map(([label,value])=><div key={label}><dt className="text-xs">{t(`project.${label}`)}</dt><dd className="ui-numeric mt-1 font-medium">{displayMoney(value,total.currency)}</dd></div>)}</dl>)}</div></AnimatedDisclosure> : null;
  return <div className="w-full min-w-0 space-y-4" data-project-finance>
    <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3" aria-label={t("orders.scope")}>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        {props.summary || !totals.length ? <dl className="contents">
          {([['value', props.summary?.gross], ['paid', props.summary?.paid], ['remaining', props.summary?.remaining]] as const).map(([key,value]) => <div key={key} className={`min-w-min max-w-full flex-1 basis-[calc(50%-0.625rem)] lg:basis-0 ${key === "value" ? "lg:grow-[1.15]" : ""}`}><dt className="text-xs text-[var(--ui-text-secondary)]">{t(`orders.${key}`)}</dt><dd className={`ui-numeric mt-1 font-semibold leading-tight ${key === "paid" && Number(value) > 0 ? "text-[var(--ui-success-text)]" : ""} ${key === "value" ? "text-[1.375rem] sm:text-2xl" : "text-xl"}`}>{summaryMoney(value, props.displayCurrency, approximate)}</dd>{key === "value" && pricePerArea !== null ? <p className="ui-numeric mt-1 text-xs text-[var(--ui-text-muted)]">{t("orders.pricePerArea", { price: `${approximate ? "≈ " : ""}${money(pricePerArea, props.displayCurrency)}` })}</p> : null}</div>)}
        </dl> : <div className="min-w-0 basis-full space-y-2 xl:flex-[3_1_0%]"><p className="text-xs text-[var(--ui-text-secondary)]">{t("orders.missingRate")}</p>{totals.map(total => <dl key={total.currency} className="flex flex-wrap gap-3">{([['value',total.contract_gross_amount ?? total.contract_amount],['paid',total.collected_amount],['remaining',projectAgreementRemaining(total.contract_gross_amount ?? total.contract_amount,total.collected_amount,props.currencies.find(unit=>unit.code===total.currency)?.minor_units??2,total.closed_amount)]] as const).map(([key,value])=><div key={key} className="min-w-min max-w-full flex-1"><dt className="text-xs text-[var(--ui-text-secondary)]">{t(`orders.${key}`)}</dt><dd className="ui-numeric mt-1 text-sm font-semibold">{summaryMoney(value,total.currency)}</dd></div>)}</dl>)}</div>}
        <div className="min-w-0 flex-1 basis-[calc(50%-0.625rem)] lg:min-w-40 lg:basis-0 lg:grow-[1.25]">
          {next ? <Link href={`${href("payments")}&item=${next.id}#expected-${next.id}`} className="group block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="block text-xs text-[var(--ui-text-secondary)]">{t("orders.next")}</span><span className="ui-numeric mt-1 flex items-baseline gap-2 text-lg font-semibold">{displayMoney(next.remaining_amount,next.currency)}<ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0"/></span><span className="mt-1 block break-words text-xs text-[var(--ui-text-secondary)]">{next.currency !== props.displayCurrency ? `${money(next.remaining_amount, next.currency)} · ` : ""}{next.expected_payment_date || next.due_date ? formatDateOnly(next.expected_payment_date ?? next.due_date ?? "",locale) : t("projectWorkspace.undated")} · {next.order_name} · {next.description}</span></Link> : <><p className="text-xs text-[var(--ui-text-secondary)]">{t("orders.next")}</p><p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("orders.noNext")}</p></>}
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-1 border-t border-[var(--ui-border-subtle)] pt-2 lg:ml-auto lg:w-auto lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
          <div className="flex items-center gap-2"><DisplayCurrencySelect value={props.displayCurrency} variant="secondary"/><Button variant="outline" size="compact" className="cursor-pointer" aria-label={t("orders.manage", { count: confirmed.length })} onClick={() => setManager("")}>{t("orders.count", { count: confirmed.length })}<ChevronRight aria-hidden="true" className="size-4 text-[var(--ui-text-muted)]"/></Button></div>
          {draftCount ? <span className="text-xs text-[var(--ui-text-muted)]">{t("orders.draftCount", { count: draftCount })}</span> : null}
        </div>
      </div>
      {completion !== null ? <div role="progressbar" aria-label={t("orders.scope")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(completion)} className="mt-3 h-0.5 overflow-hidden rounded-full bg-[var(--ui-border-subtle)]"><div className="h-full origin-left bg-[var(--ui-success-accent)] transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scaleX(${completion / 100})` }}/></div> : null}
      {approximate && props.summary ? <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--ui-text-muted)]"><Info aria-hidden="true" className="mt-0.5 size-3 shrink-0"/>{t("orders.valuation",{date:formatDateOnly(props.today,locale)})}</p> : null}
    </section>
    <nav aria-label={t("projectWorkspace.navigation")} className="flex gap-1 border-b border-[var(--ui-border)]">
      {(["payments", "expenses", "result"] as const).map(tab => <Link key={tab} href={href(tab, props.stream === "expenses" ? "design" : props.stream)} scroll={false} aria-current={tab === props.tab ? "page" : undefined} className="flex min-h-11 flex-1 items-center justify-center border-b-2 border-transparent px-4 py-2 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:border-[var(--ui-text)] aria-[current=page]:text-[var(--ui-text)] motion-reduce:transition-none sm:flex-none">{t(`projectWorkspace.tabs.${tab}`)}</Link>)}
    </nav>
    {props.planning ? <div id="project-payments"><FinanceExpectedWorkspace {...props} {...props.planning} project={{...props.project,stream:props.stream,today:props.today}} toolbar={props.tab === "payments" ? incomeSelector : undefined} toolbarActions={incomeActions} toolbarDetails={incomeDetails} onManageOrder={id => setManager(id ?? "")}/></div> : null}
    {props.children}
    {manager !== null ? <ProjectOrdersManager key={manager} initialOrderId={manager || undefined} project={props.project} currencies={props.currencies} reportingCurrency={props.settings.base_currency} display={props.display} onClose={() => setManager(null)}/> : null}
    <Dialog isOpen={historyOpen} onRequestClose={()=>setHistoryOpen(false)} title={t("project.history")} closeLabel={t("movements.close")}><ul className="min-h-0 space-y-3 overflow-y-auto p-5">{props.project.termHistory.filter(term=>term.stream==="supervision").map(term=><li key={term.id}><p className="text-sm font-medium">{t("project.revision",{version:term.revision})} · {term.amount !== null ? money(term.amount,term.currency) : t(`project.modes.${term.mode}`)}{term.price_basis ? ` · ${t(term.price_basis === "net" ? "builder.net" : "builder.gross")}` : ""}</p>{term.vat_rate !== null ? <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{term.amount === null ? `${t("builder.vat")} ${term.vat_rate}%` : t("project.vatBreakdown",{net:money(term.net_amount,term.currency),vat:money(term.vat_amount,term.currency),gross:money(term.gross_amount,term.currency)})}</p> : null}<p className="mt-1 text-xs text-[var(--ui-text-muted)]">{formatDateOnly(term.created_at.slice(0,10),locale)}{term.effective_from ? ` · ${formatDateOnly(term.effective_from,locale)}` : ""}</p><p className="mt-1 whitespace-pre-wrap text-xs text-[var(--ui-text-secondary)]">{term.reason}</p></li>)}</ul></Dialog>
    <Dialog isOpen={editor !== null} onRequestClose={()=>setEditor(null)} closeDisabled={pending} title={t(editor === "months" ? "project.generate" : "project.editSupervision")} closeLabel={t("movements.close")}><div className="min-h-0 overflow-y-auto p-4 sm:p-6">{editor === "months" ? <MonthsForm data={props} onSaved={()=>setEditor(null)} onPending={setPending}/> : editor ? <TermsForm data={props} onSaved={()=>setEditor(null)} onPending={setPending}/> : null}</div></Dialog>
  </div>;
}
