"use client";
import Link from "next/link";
import { ArrowUpRight, History, Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { projectAgreementRemaining, type projectContractSummary, type ProjectFinanceTab } from "@/lib/finance-project-view";
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
  displayCurrency: FinanceDisplayCurrency; summary: ReturnType<typeof projectContractSummary>;
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
  if (!props.settings?.finalized_at) return <section className={panel}>{t("movements.setupRequired")} <Link className="underline" href="/finance/accounts">{t("movements.setupLink")}</Link></section>;
  const href = (tab: ProjectFinanceTab, stream = "design") => `/projects/${props.project.projectId}?view=finance&financeTab=${tab}${tab === "payments" ? `&stream=${stream}` : ""}`;
  const next = props.project.nextPayment;
  const incomeSelector = <div className="mr-auto w-full min-w-0 sm:w-auto"><Select aria-label={t("orders.category")} size="compact" value={props.stream} onValueChange={stream => router.push(href("payments", stream), { scroll: false })}>{projectStreams.filter(stream => stream !== "expenses").map(stream => <SelectItem key={stream} value={stream}>{t(stream === "design" ? "orders.contractual" : `project.streams.${stream}`)}</SelectItem>)}</Select></div>;
  return <div className="w-full min-w-0 space-y-4" data-project-finance>
    <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4" aria-label={t("orders.scope")}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="mr-auto text-xs font-medium text-[var(--ui-text-secondary)]">{t("orders.scope")}</h2>
        <DisplayCurrencySelect value={props.displayCurrency}/>
        <Button variant="ghost" size="sm" className="min-h-9" onClick={() => setManager("")}>{t("orders.manage", { count: confirmed.length })}</Button>
        {draftCount ? <span className="text-xs text-[var(--ui-text-muted)]">{t("orders.draftCount", { count: draftCount })}</span> : null}
      </div>
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
        {props.summary || !totals.length ? <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-[1.25fr_1fr_1fr]">
          {([['value', props.summary?.gross], ['paid', props.summary?.paid], ['remaining', props.summary?.remaining]] as const).map(([key,value]) => <div key={key} className={key === "value" ? "col-span-2 sm:col-span-1" : ""}><dt className="text-xs text-[var(--ui-text-secondary)]">{t(`orders.${key}`)}</dt><dd className={`ui-numeric mt-1 break-words font-semibold ${key === "value" ? "text-2xl sm:text-[1.75rem]" : "text-xl"}`}>{value ? `${approximate ? "≈ " : ""}${money(value, props.displayCurrency)}` : "—"}</dd></div>)}
        </dl> : <div className="min-w-0 space-y-2"><p className="text-xs text-[var(--ui-text-secondary)]">{t("orders.missingRate")}</p>{totals.map(total => <dl key={total.currency} className="grid grid-cols-3 gap-3">{([['value',total.contract_gross_amount ?? total.contract_amount],['paid',total.collected_amount],['remaining',projectAgreementRemaining(total.contract_gross_amount ?? total.contract_amount,total.collected_amount,props.currencies.find(unit=>unit.code===total.currency)?.minor_units??2,total.closed_amount)]] as const).map(([key,value])=><div key={key}><dt className="text-xs text-[var(--ui-text-secondary)]">{t(`orders.${key}`)}</dt><dd className="ui-numeric mt-1 break-words text-sm font-semibold">{money(value,total.currency)}</dd></div>)}</dl>)}</div>}
        <div className="min-w-0 border-t border-[var(--ui-border-subtle)] pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          {next ? <Link href={`${href("payments")}&item=${next.id}#expected-${next.id}`} className="group block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="block text-xs text-[var(--ui-text-secondary)]">{t("orders.next")}</span><span className="ui-numeric mt-1 flex items-baseline gap-2 text-lg font-semibold">{money(next.remaining_amount,next.currency)}<ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0"/></span><span className="mt-1 block break-words text-xs text-[var(--ui-text-secondary)]">{formatDateOnly(next.expected_payment_date ?? next.due_date ?? "",locale)} · {next.order_name} · {next.description}</span></Link> : <><p className="text-xs text-[var(--ui-text-secondary)]">{t("orders.next")}</p><p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("orders.noNext")}</p></>}
        </div>
      </div>
      {approximate && props.summary ? <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--ui-text-muted)]"><Info aria-hidden="true" className="mt-0.5 size-3 shrink-0"/>{t("orders.valuation",{date:formatDateOnly(props.today,locale)})}</p> : null}
    </section>
    <nav aria-label={t("projectWorkspace.navigation")} className="flex gap-1 border-b border-[var(--ui-border)]">
      {(["payments", "expenses", "result"] as const).map(tab => <Link key={tab} href={href(tab, props.stream === "expenses" ? "design" : props.stream)} scroll={false} aria-current={tab === props.tab ? "page" : undefined} className="flex min-h-11 flex-1 items-center justify-center border-b-2 border-transparent px-4 py-2 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:border-[var(--ui-text)] aria-[current=page]:text-[var(--ui-text)] motion-reduce:transition-none sm:flex-none">{t(`projectWorkspace.tabs.${tab}`)}</Link>)}
    </nav>
    {props.tab === "payments" && props.stream === "supervision" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3 text-sm"><p>{supervision ? `${t(`project.modes.${supervision.mode}`)}${supervision.amount ? ` · ${money(supervision.amount, supervision.currency)}` : ""}` : t("project.editSupervision")}</p><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => setEditor("supervision")}>{t("project.editSupervision")}</Button>{props.project.termHistory.some(term => term.mode === "monthly") ? <Button size="sm" variant="ghost" onClick={() => setEditor("months")}>{t("project.generate")}</Button> : null}{supervision ? <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}><History aria-hidden="true" className="mr-2 size-4"/>{t("project.history")}</Button> : null}</div></div> : null}
    {props.tab === "payments" && props.stream !== "design" ? <AnimatedDisclosure title={t("projectWorkspace.categoryDetails")}><div className="space-y-3 pb-2 text-sm text-[var(--ui-text-secondary)]">{supervision && props.stream === "supervision" ? <><p>{t(`project.modes.${supervision.mode}`)} · {supervision.effective_from ? formatDateOnly(supervision.effective_from,locale) : "—"} — {supervision.effective_through ? formatDateOnly(supervision.effective_through,locale) : t("project.openEnded")}</p>{supervision.vat_rate !== null && supervision.amount !== null ? <p className="text-xs">{t("project.vatBreakdown", { net: money(supervision.net_amount,supervision.currency),vat:money(supervision.vat_amount,supervision.currency),gross:money(supervision.gross_amount,supervision.currency) })}</p> : null}</> : null}{props.project.totals.filter(total => total.stream === props.stream).map(total => <dl key={total.currency} className="flex flex-wrap gap-x-8 gap-y-3">{([["collected", total.collected_amount], ["outstanding", total.outstanding_amount], ["planned", total.planned_amount]] as const).map(([label,value])=><div key={label}><dt className="text-xs">{t(`project.${label}`)}</dt><dd className="ui-numeric mt-1 font-medium">{money(value,total.currency)}</dd></div>)}</dl>)}</div></AnimatedDisclosure> : null}
    {props.planning ? <div id="project-payments"><FinanceExpectedWorkspace {...props} {...props.planning} project={{...props.project,stream:props.stream,today:props.today}} toolbar={props.tab === "payments" ? incomeSelector : undefined} onManageOrder={id => setManager(id ?? "")}/></div> : null}
    {props.children}
    {manager !== null ? <ProjectOrdersManager key={manager} initialOrderId={manager || undefined} project={props.project} currencies={props.currencies} reportingCurrency={props.settings.base_currency} onClose={() => setManager(null)}/> : null}
    <Dialog isOpen={historyOpen} onRequestClose={()=>setHistoryOpen(false)} title={t("project.history")} closeLabel={t("movements.close")}><ul className="min-h-0 space-y-3 overflow-y-auto p-5">{props.project.termHistory.filter(term=>term.stream==="supervision").map(term=><li key={term.id}><p className="text-sm font-medium">{t("project.revision",{version:term.revision})} · {term.amount !== null ? money(term.amount,term.currency) : t(`project.modes.${term.mode}`)}{term.price_basis ? ` · ${t(term.price_basis === "net" ? "builder.net" : "builder.gross")}` : ""}</p>{term.vat_rate !== null ? <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{term.amount === null ? `${t("builder.vat")} ${term.vat_rate}%` : t("project.vatBreakdown",{net:money(term.net_amount,term.currency),vat:money(term.vat_amount,term.currency),gross:money(term.gross_amount,term.currency)})}</p> : null}<p className="mt-1 text-xs text-[var(--ui-text-muted)]">{formatDateOnly(term.created_at.slice(0,10),locale)}{term.effective_from ? ` · ${formatDateOnly(term.effective_from,locale)}` : ""}</p><p className="mt-1 whitespace-pre-wrap text-xs text-[var(--ui-text-secondary)]">{term.reason}</p></li>)}</ul></Dialog>
    <Dialog isOpen={editor !== null} onRequestClose={()=>setEditor(null)} closeDisabled={pending} title={t(editor === "months" ? "project.generate" : "project.editSupervision")} closeLabel={t("movements.close")}><div className="min-h-0 overflow-y-auto p-4 sm:p-6">{editor === "months" ? <MonthsForm data={props} onSaved={()=>setEditor(null)} onPending={setPending}/> : editor ? <TermsForm data={props} onSaved={()=>setEditor(null)} onPending={setPending}/> : null}</div></Dialog>
  </div>;
}
