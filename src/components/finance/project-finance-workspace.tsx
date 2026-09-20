"use client";
import Link from "next/link";
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
import { FinanceExpectedWorkspace } from "./expected-workspace";
import { formatFinanceAmount } from "@/lib/finance";
import { projectStreams } from "@/lib/finance-projects";
import { formatDateOnly } from "@/lib/utils";
import type { FinancePlanningData, FinanceProjectData, getFinanceData } from "@/data/queries/finance";

type Props = NonNullable<Awaited<ReturnType<typeof getFinanceData>>> & FinancePlanningData & {
  project: FinanceProjectData; stream: typeof projectStreams[number]; today: string; page: number; creditPage: number; filter: string;
};
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5";

function TermsForm({ data, stream, onSaved, onPending }: { data: Props; stream: "design" | "supervision"; onSaved: () => void; onPending: (v: boolean) => void }) {
  const t = useTranslations("Finance"), locale = useLocale();
  const current = data.project.terms.find((v) => v.stream === stream);
  const [mode, setMode] = useState(current?.mode ?? (stream === "design" ? "design" : "monthly"));
  const [currency, setCurrency] = useState(current?.currency ?? data.settings?.base_currency ?? "UAH");
  const [from, setFrom] = useState(current ? "" : `${data.today.slice(0, 7)}-01`), [through, setThrough] = useState("");
  return <FinanceActionForm action={saveFinanceProject} label={t("planning.save")} onSaved={onSaved} onPending={onPending}>
    <input type="hidden" name="intent" value="terms"/><input type="hidden" name="projectId" value={data.project.projectId}/><input type="hidden" name="stream" value={stream}/><input type="hidden" name="revision" value={current?.revision ?? 0}/>
    {stream === "design" ? <input type="hidden" name="mode" value="design"/> : <FormField label={t("project.arrangement")}><Select name="mode" aria-label={t("project.arrangement")} value={mode} onValueChange={setMode}>{["monthly", "per_visit", "custom", "stopped"].map((v) => <SelectItem key={v} value={v}>{t(`project.modes.${v}`)}</SelectItem>)}</Select></FormField>}
    <div className="grid gap-4 sm:grid-cols-2">
      {["custom", "stopped"].includes(mode) ? <input type="hidden" name="amount" value=""/> : <FormField label={t(stream === "design" ? "project.contract" : "project.rate")}><Input name="amount" defaultValue={current?.amount ?? ""} inputMode="decimal" required/></FormField>}
      <FormField label={t("project.currency")}><FinanceCurrencySelect name="currency" currencies={data.currencies} reportingCurrency={data.settings?.base_currency ?? ""} value={currency} onValueChange={setCurrency}/></FormField>
      {stream === "supervision" ? <><FormField label={t("project.effectiveFrom")}><DatePicker name="effectiveFrom" aria-label={t("project.effectiveFrom")} value={from} onValueChange={setFrom} locale={locale}/></FormField><FormField label={t("project.effectiveThrough")}><DatePicker name="effectiveThrough" aria-label={t("project.effectiveThrough")} value={through} onValueChange={setThrough} locale={locale}/></FormField></> : null}
    </div>
    {stream === "supervision" ? <p className="text-xs text-[var(--ui-text-muted)]">{t("project.monthHelp")}</p> : null}
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
  const money = (amount: number | null, code: string | null) => {
    const currency = props.currencies.find((v) => v.code === code);
    return currency ? formatFinanceAmount(amount ?? 0, currency, locale) : "—";
  };
  if (!props.settings?.finalized_at) return <section className={panel}>{t("movements.setupRequired")} <Link className="underline" href="/finance/accounts">{t("movements.setupLink")}</Link></section>;
  return <div className="mx-auto w-full max-w-4xl space-y-5">
    <nav aria-label={t("project.streamNavigation")} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">{projectStreams.map((stream) => <Link key={stream} href={`/projects/${props.project.projectId}?view=finance&stream=${stream}`} aria-current={stream === props.stream ? "page" : undefined} className="py-2 text-[var(--ui-text-secondary)] aria-[current=page]:font-semibold aria-[current=page]:underline">{t(`project.streams.${stream}`)}</Link>)}</nav>
    <section className={`${panel} space-y-4`} aria-label={t("project.summary")}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t("project.summary")}</h2><div className="flex flex-wrap gap-2">
        {props.stream === "design" || props.stream === "supervision" ? <Button variant="outline" onClick={() => setEditor(props.stream === "design" ? "design" : "supervision")}>{t(props.stream === "design" ? "project.editAgreement" : "project.editSupervision")}</Button> : null}
        {props.stream === "supervision" && props.project.termHistory.some((term)=>term.mode==="monthly") ? <Button variant="outline" onClick={() => setEditor("months")}>{t("project.generate")}</Button> : null}
      </div></div>
      {props.stream === "design" && !terms ? <p className="text-sm text-[var(--ui-text-muted)]">{t("project.noAgreement")}</p> : null}
      {props.stream === "supervision" && terms ? <p className="text-sm">{t(`project.modes.${terms.mode}`)}{terms.amount ? ` · ${money(terms.amount, terms.currency)}` : ""} · {terms.effective_from ? formatDateOnly(terms.effective_from, locale) : ""} — {terms.effective_through ? formatDateOnly(terms.effective_through, locale) : t("project.openEnded")}</p> : null}
      {props.project.totals.filter((v) => v.stream === props.stream).map((v) => <dl key={v.currency} className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        {([...(v.contract_amount !== null ? [["contract", v.contract_amount], ["scheduled", v.scheduled_amount], ["unscheduled", v.unscheduled_amount]] as const : []), ["collected", v.collected_amount], ["outstanding", v.outstanding_amount], ["planned", v.planned_amount]] as const).map(([key, value]) => <div key={key}><dt className="text-[var(--ui-text-muted)]">{t(`project.${key}`)}</dt><dd className="ui-numeric mt-1 font-semibold">{money(value, v.currency)}</dd></div>)}
      </dl>)}
      <p className="text-xs text-[var(--ui-text-muted)]">{t("project.collectionHelp")}</p>
    </section>
    <FinanceExpectedWorkspace {...props} project={{ ...props.project, stream: props.stream, today: props.today }}/>
    {props.project.termHistory.length ? <details className={`${panel} text-sm`}><summary className="cursor-pointer">{t("project.history")}</summary><ul className="mt-4 space-y-3">{props.project.termHistory.slice(0,50).map((v) => <li key={v.id}><p className="font-medium">{t(`project.streams.${v.stream}`)} · {t("project.revision", { version: v.revision })} · {v.amount ? money(v.amount, v.currency) : t(`project.modes.${v.mode}`)}</p><p className="text-xs text-[var(--ui-text-muted)]">{formatDateOnly(v.created_at.slice(0, 10), locale)}{v.effective_from ? ` · ${formatDateOnly(v.effective_from, locale)}` : ""}</p><p className="mt-1 whitespace-pre-wrap">{v.reason}</p></li>)}</ul></details> : null}
    <Dialog isOpen={editor !== null} onRequestClose={() => setEditor(null)} closeDisabled={pending} title={t(editor === "months" ? "project.generate" : editor === "supervision" ? "project.editSupervision" : "project.editAgreement")} closeLabel={t("movements.close")}>
      <div className="p-5">{editor === "months" ? <MonthsForm data={props} onSaved={() => setEditor(null)} onPending={setPending}/> : editor ? <TermsForm data={props} stream={editor} onSaved={() => setEditor(null)} onPending={setPending}/> : null}</div>
    </Dialog>
  </div>;
}
