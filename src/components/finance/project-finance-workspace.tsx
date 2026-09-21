"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceProject } from "@/app/(app)/finance/project-actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCurrencySelect } from "./currency-select";
import { ProjectValueBuilder } from "./project-value-builder";
import { FinanceExpectedWorkspace } from "./expected-workspace";
import { formatFinanceAmount, formatFinanceDecimal } from "@/lib/finance";
import { projectStreams } from "@/lib/finance-projects";
import { formatDateOnly } from "@/lib/utils";
import type { FinancePlanningData, FinanceProjectData, getFinanceData } from "@/data/queries/finance";

type Props = NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & FinancePlanningData & {
  project: FinanceProjectData; stream: typeof projectStreams[number]; today: string; page: number; creditPage: number; filter: string;
};
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5";

function TermsForm({ data, onSaved, onPending }: { data: Props; onSaved: () => void; onPending: (v: boolean) => void }) {
  const t = useTranslations("Finance"), locale = useLocale();
  const current = data.project.terms.find((v) => v.stream === "supervision");
  const [mode, setMode] = useState(current?.mode ?? "monthly");
  const [currency, setCurrency] = useState(current?.currency ?? data.settings?.base_currency ?? "UAH");
  const [from, setFrom] = useState(current ? "" : `${data.today.slice(0, 7)}-01`), [through, setThrough] = useState("");
  return <FinanceActionForm action={saveFinanceProject} label={t("planning.save")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value="terms"/><input type="hidden" name="projectId" value={data.project.projectId}/><input type="hidden" name="stream" value="supervision"/><input type="hidden" name="revision" value={current?.revision ?? 0}/>
    <FormField label={t("project.arrangement")}><Select name="mode" aria-label={t("project.arrangement")} value={mode} onValueChange={setMode}>{["monthly", "per_visit", "custom", "stopped"].map((v) => <SelectItem key={v} value={v}>{t(`project.modes.${v}`)}</SelectItem>)}</Select></FormField>
    <div className="grid gap-4 sm:grid-cols-2">
      {["custom", "stopped"].includes(mode) ? <input type="hidden" name="amount" value=""/> : <FormField label={t("project.rate")}><Input name="amount" defaultValue={current?.amount ?? ""} inputMode="decimal" required/></FormField>}
      <FormField label={t("project.currency")}><FinanceCurrencySelect name="currency" currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={currency} onValueChange={setCurrency}/></FormField>
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
  const t = useTranslations("Finance"), locale = useLocale();
  const [editor, setEditor] = useState<"design" | "supervision" | "months" | null>(null), [pending, setPending] = useState(false);
  const terms = props.project.terms.find((v) => v.stream === props.stream);
  const pricing = props.project.planRevisions.find(v=>v.terms_id===terms?.id);
  const order = pricing?.item_order??[];
  const items = props.stream==="design" ? [...props.items].sort((a,b)=>{const ai=order.indexOf(a.id??""),bi=order.indexOf(b.id??"");return (ai<0?-1:ai)-(bi<0?-1:bi);}) : props.items;
  const money = (amount: string | number | null, code: string | null) => {
    const currency = props.currencies.find((v) => v.code === code);
    return currency ? formatFinanceAmount(amount ?? 0, currency, locale) : "—";
  };
  const rateMoney=(amount:number|null,code:string|null)=>amount===null?"—":`${formatFinanceDecimal(amount,locale,{maximumFractionDigits:4})} ${code??""}`;
  if (!props.settings?.finalized_at) return <section className={panel}>{t("movements.setupRequired")} <Link className="underline" href="/finance/accounts">{t("movements.setupLink")}</Link></section>;
  return <div className="w-full space-y-4 [--finance-content-width:100%]" data-project-finance>
    <nav aria-label={t("project.streamNavigation")} className="grid grid-cols-2 gap-1 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-1.5 text-sm sm:flex sm:flex-wrap">{projectStreams.map((stream) => <Link key={stream} href={`/projects/${props.project.projectId}?view=finance&stream=${stream}`} aria-current={stream === props.stream ? "page" : undefined} className="flex min-h-11 items-center justify-center rounded-[var(--ui-radius-control)] border border-transparent px-3 py-2 text-center text-[var(--ui-text-secondary)] transition-colors duration-[220ms] hover:bg-[var(--ui-surface)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none aria-[current=page]:border-[var(--ui-border-strong)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--ui-text)]">{t(`project.streams.${stream}`)}</Link>)}</nav>
    {props.stream === "design" || props.stream === "supervision" || props.project.totals.some((v) => v.stream === props.stream) ? <section className={`${panel} space-y-3`} aria-label={t("project.summary")}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t("project.summary")}</h2><div className="flex flex-wrap gap-2">
        {props.stream === "design" || props.stream === "supervision" ? <Button variant={props.stream==="design"?"default":"outline"} onClick={() => setEditor(props.stream === "design" ? "design" : "supervision")}>{t(props.stream === "design" ? "project.editAgreement" : "project.editSupervision")}</Button> : null}
        {props.stream === "supervision" && props.project.termHistory.some((term)=>term.mode==="monthly") ? <Button variant="outline" onClick={() => setEditor("months")}>{t("project.generate")}</Button> : null}
      </div></div>
      {props.stream === "design" && pricing?.pricing_method==="area" ? <div className="text-sm text-[var(--ui-text-secondary)]"><p>{t("builder.areaSummary",{area:pricing.area_snapshot??0,rate:rateMoney(pricing.rate_per_m2,terms?.currency??null)})}</p>{props.project.area!==null&&Number(pricing.area_snapshot)!==props.project.area?<p className="mt-1 text-[var(--ui-warning-text)]">{t("builder.areaChanged",{saved:pricing.area_snapshot??0,current:props.project.area})}</p>:null}</div> : null}
      {props.stream === "design" && !terms ? <p className="text-sm text-[var(--ui-text-muted)]">{t("project.noAgreement")}</p> : null}
      {props.stream === "supervision" && terms ? <p className="text-sm">{t(`project.modes.${terms.mode}`)}{terms.amount ? ` · ${money(terms.amount, terms.currency)}` : ""} · {terms.effective_from ? formatDateOnly(terms.effective_from, locale) : ""} — {terms.effective_through ? formatDateOnly(terms.effective_through, locale) : t("project.openEnded")}</p> : null}
      {props.project.totals.filter((v) => v.stream === props.stream).map((v) => <div key={v.currency} className="space-y-4">
        <dl className={`grid gap-5 sm:grid-cols-3 ${v.contract_amount !== null ? "xl:grid-cols-[1.3fr_1fr_1fr_1fr]" : ""}`}>
          {v.contract_amount !== null ? <div className="sm:col-span-3 xl:col-span-1"><dt className="text-sm text-[var(--ui-text-secondary)]">{t("project.contract")}</dt><dd className="ui-numeric mt-1 break-words text-3xl font-semibold tracking-tight">{money(v.contract_amount, v.currency)}</dd></div> : null}
          {([["collected", v.collected_amount], ["outstanding", v.outstanding_amount], ["planned", v.planned_amount]] as const).map(([key, value]) => <div key={key} className="flex items-baseline justify-between gap-3 sm:block"><dt className="text-sm text-[var(--ui-text-secondary)]">{t(`project.${key}`)}</dt><dd className={`ui-numeric mt-1 break-words text-lg font-semibold sm:text-2xl ${key === "collected" ? "text-[var(--ui-success-text)]" : key === "outstanding" && Number(value) > 0 ? "text-[var(--ui-warning-text)]" : ""}`}>{money(value, v.currency)}</dd></div>)}
        </dl>
        {v.contract_amount !== null && Number(v.contract_amount) > 0 ? <div className="space-y-2">
          <progress aria-label={t("project.collectionProgress")} max={Number(v.contract_amount)} value={Math.min(Number(v.collected_amount), Number(v.contract_amount))} className="block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[var(--ui-surface-muted)] [&::-webkit-progress-value]:bg-[var(--ui-success-text)] [&::-moz-progress-bar]:bg-[var(--ui-success-text)]"/>
          <p className="text-xs text-[var(--ui-text-muted)]">{t("project.valueScope")}</p>
        </div> : null}
        {Number(v.unscheduled_amount) > 0 ? <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] pt-3 text-sm"><p className="text-[var(--ui-warning-text)]">{t("project.unscheduledAction", { amount: money(v.unscheduled_amount, v.currency) })}</p><button type="button" onClick={()=>setEditor("design")} className="inline-flex min-h-11 items-center gap-2 rounded px-2 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("project.schedulePayment")}<ArrowUpRight aria-hidden="true" className="size-4"/></button></div> : null}
      </div>)}
      {props.stream === "design" && props.project.nextPayment ? <Link href={`/finance/expected?item=${props.project.nextPayment.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] pt-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="text-[var(--ui-text-secondary)]">{t("project.nextPayment")} · {formatDateOnly(props.project.nextPayment.expected_payment_date ?? props.project.nextPayment.due_date ?? "", locale)}<span className="ml-2 font-medium text-[var(--ui-text)]">{props.project.nextPayment.description}</span></span><span className="ui-numeric inline-flex items-center gap-2 font-semibold">{money(props.project.nextPayment.remaining_amount, props.project.nextPayment.currency)}<ArrowUpRight aria-hidden="true" className="size-4"/></span></Link> : null}
    </section> : null}
    <div id="project-payments"><FinanceExpectedWorkspace {...props} items={items} project={{ ...props.project, stream: props.stream, today: props.today }}/></div>
    {props.project.termHistory.some((v) => v.stream === props.stream) ? <AnimatedDisclosure className={`${panel} !py-2 text-sm motion-reduce:[&_*]:transition-none`} title={t("project.history")}><ul className="mt-4 space-y-3">{props.project.termHistory.filter((v) => v.stream === props.stream).slice(0,50).map((v) => <li key={v.id}><p className="font-medium">{t(`project.streams.${v.stream}`)} · {t("project.revision", { version: v.revision })} · {v.amount ? money(v.amount, v.currency) : t(`project.modes.${v.mode}`)}</p><p className="text-xs text-[var(--ui-text-muted)]">{formatDateOnly(v.created_at.slice(0, 10), locale)}{v.effective_from ? ` · ${formatDateOnly(v.effective_from, locale)}` : ""}</p>{props.project.planRevisions.filter(p=>p.terms_id===v.id&&p.pricing_method==="area").map(p=><p key={p.terms_id} className="text-xs text-[var(--ui-text-secondary)]">{t("builder.areaSummary",{area:p.area_snapshot??0,rate:rateMoney(p.rate_per_m2,v.currency)})}</p>)}<p className="mt-1 whitespace-pre-wrap">{v.reason}</p></li>)}</ul><p className="my-3 text-xs text-[var(--ui-text-muted)]">{t("project.collectionHelp")}</p></AnimatedDisclosure> : null}
    <Dialog isOpen={editor !== null} onRequestClose={() => setEditor(null)} closeDisabled={pending} title={t(editor === "months" ? "project.generate" : editor === "supervision" ? "project.editSupervision" : "project.editAgreement")} closeLabel={t("movements.close")}>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">{editor === "design" ? <ProjectValueBuilder project={props.project} currencies={props.currencies} reportingCurrency={props.settings?.base_currency??"UAH"} onSaved={()=>setEditor(null)} onPending={setPending}/> : editor === "months" ? <MonthsForm data={props} onSaved={() => setEditor(null)} onPending={setPending}/> : editor ? <TermsForm data={props} onSaved={() => setEditor(null)} onPending={setPending}/> : null}</div>
    </Dialog>
  </div>;
}
