"use client";

import { useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import actionFeedback from "@/components/ui/primary-action-feedback.module.css";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AnimatedDisclosure, AnimatedFormContent } from "@/components/ui/animated-form-content";
import { FinanceVatControls } from "@/components/finance/project-value-builder";
import { FinanceCurrencySelect } from "@/components/finance/currency-select";
import { proposalPresentationSchema } from "@/lib/finance-proposal";
import { resolveLeadProposalIdentity } from "@/lib/crm-proposal";
import { cn } from "@/lib/utils";
import { projectAreaValue, projectClientPaymentSchedule, projectDiscountAmounts, projectMoneyText, projectMoneyUnits, projectPaymentAmounts, projectPaymentDefaultKey, projectPaymentTemplates, projectVatAmounts } from "@/lib/finance-project-plan";
import { proposalCommercialTermsSchema, type LeadProposalContext, type ProposalCommercialTerms } from "@/lib/proposal-commercial-terms";

export function LeadCommercialTerms({ context, initialTerms, initialTitle, formId, numberLocked, pending, onApply }: {
  context: LeadProposalContext; initialTerms?: ProposalCommercialTerms; initialTitle?: string; formId: string;
  numberLocked: boolean; pending: boolean; onApply: (terms: ProposalCommercialTerms, title: string) => Promise<void>;
}) {
  const t = useTranslations("Finance"), locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(initialTitle ?? context.title);
  const [terms, setTerms] = useState<ProposalCommercialTerms>(() => initialTerms ?? context.terms ?? {
    number: "", pricingMethod: context.area ? "area" : "fixed", amount: "", area: context.area, rate: "", currency: "USD",
    discountType: "none", discountValue: "0", vatRate: null, priceBasis: null,
    payments: [{ id: crypto.randomUUID(), name: t("builder.projectPayment"), percentage: "100", note: "" }],
  });
  const [submitted, setSubmitted] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(terms.discountType !== "none" || terms.vatRate !== null);
  const [notesOpen, setNotesOpen] = useState(false);
  const identity = resolveLeadProposalIdentity(terms.number, title);
  const parsed = proposalCommercialTermsSchema.safeParse({ ...terms, number: identity.number });
  const titleValid = proposalPresentationSchema.shape.projectTitle.safeParse(identity.title).success;
  const currency = context.currencies.find(item => item.code === terms.currency);
  const digits = currency?.minor_units ?? 2;
  const number = (value: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(Number(value));
  const money = (value: string) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value))} ${terms.currency}`;
  const hasIssue = (...path: (string | number)[]) => !parsed.success && parsed.error.issues.some(issue => path.every((part, index) => issue.path[index] === part));
  const fieldError = (...path: (string | number)[]) => submitted && hasIssue(...path) ? t("proposal.leadInvalidValue") : undefined;
  let list = "", amount = "", gross = "", payments: string[] = [], priceInvalid = false, scheduleInvalid = false;
  try {
    list = terms.pricingMethod === "area" ? projectAreaValue(terms.area, terms.rate, digits) : terms.amount;
    amount = projectDiscountAmounts(list, terms.discountType, terms.discountValue, digits).agreed;
    gross = projectVatAmounts(amount, terms.vatRate, terms.priceBasis, digits).gross;
  } catch { priceInvalid = true; }
  try {
    const percentages = terms.payments.map(item => item.percentage);
    projectPaymentAmounts(gross, percentages, digits);
    payments = projectClientPaymentSchedule(gross, percentages, terms.vatRate, terms.priceBasis, digits).grossAmounts;
    scheduleInvalid = payments.some(value => projectMoneyUnits(value, digits) <= BigInt(0));
  } catch { scheduleInvalid = true; }
  let percentageTotal = "—";
  try { percentageTotal = number(projectMoneyText(terms.payments.reduce((sum, item) => sum + projectMoneyUnits(item.percentage, 4), BigInt(0)), 4)); } catch { /* Incomplete shares have no total. */ }

  function change(patch: Partial<ProposalCommercialTerms>) { setTerms(old => ({ ...old, ...patch })); }
  function editPayment(index: number, patch: Partial<ProposalCommercialTerms["payments"][number]>) {
    change({ payments: terms.payments.map((item, position) => position === index ? { ...item, ...patch } : item) });
  }
  const currencyField = <FinanceCurrencySelect
    name="currency" aria-label={t("builder.currencyShort")} aria-invalid={submitted && !currency}
    currencies={context.currencies} reportingCurrency="" value={terms.currency}
    placeholder={t("builder.currencyShort")} onValueChange={value => change({ currency: value })}
    className={`${actionFeedback.primary} ${actionFeedback.joined} relative w-28 shrink-0 grid-cols-[minmax(0,1fr)_1.75rem] rounded-l-none border-l-0 bg-[var(--ui-action-primary)] font-semibold text-[var(--ui-action-primary-text)] hover:bg-[var(--ui-action-primary-hover)] data-[state=open]:bg-[var(--ui-action-primary-hover)] data-[placeholder]:text-[var(--ui-action-primary-text)] focus-visible:z-10 [&>span:last-child]:w-7 [&>span:last-child]:border-[var(--ui-action-primary-hover)] [&>span:last-child]:text-[var(--ui-action-primary-text)]`}
  />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitted(true);
    setTerms(old => ({ ...old, number: identity.number })); setTitle(identity.title);
    if (!parsed.success || !titleValid || !currency || priceInvalid || scheduleInvalid) {
      if (hasIssue("discountValue") || hasIssue("vatRate")) setOptionsOpen(true);
      if (terms.payments.some((_, index) => hasIssue("payments", index, "note"))) setNotesOpen(true);
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    await onApply(parsed.data, identity.title);
  }

  return <form id={formId} ref={form} data-lead-proposal-terms noValidate onSubmit={submit} className="space-y-6 motion-safe:animate-[checklist-picker-in_180ms_ease-out]">
    <fieldset disabled={pending} className="grid min-w-0 gap-6">
      <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
        <FormField label={t("proposal.leadNumber")} error={submitted && hasIssue("number") ? t("proposal.leadNumberInvalid") : undefined}><Input aria-label={t("proposal.leadNumber")} value={terms.number} inputMode="numeric" placeholder="546" readOnly={numberLocked} aria-invalid={submitted && hasIssue("number")} onChange={event => change({ number: event.target.value })} /></FormField>
        <FormField label={t("proposal.title")} error={submitted && !titleValid ? t("proposal.leadInvalidValue") : undefined}><Input aria-label={t("proposal.title")} value={title} maxLength={500} aria-invalid={submitted && !titleValid} onChange={event => setTitle(event.target.value)} /></FormField>
      </div>
      <div className="grid min-w-0 gap-8 md:grid-cols-2">
        <section className="min-w-0 space-y-4" aria-label={t("builder.pricing")}>
          <h3 className="text-base font-semibold">{t("builder.listPrice")}</h3>
          <SegmentedControl ariaLabel={t("builder.pricingMethod")} className="w-full" value={terms.pricingMethod} items={[{ value: "area", label: t("builder.perAreaShort") }, { value: "fixed", label: t("builder.fixedShort") }]} onValueChange={value => change({ pricingMethod: value })} />
          {terms.pricingMethod === "area" ? <div className="grid grid-cols-[minmax(4.5rem,1fr)_auto_minmax(0,2fr)] items-start gap-2 sm:gap-3">
            <FormField label={t("builder.areaShort")} error={fieldError("area")}><Input aria-label={t("builder.areaShort")} inputMode="decimal" value={terms.area} aria-invalid={submitted && hasIssue("area")} onChange={event => change({ area: event.target.value })} /></FormField><span className="pt-9 text-[var(--ui-text-muted)]" aria-hidden="true">×</span>
            <FormField as="div" label={t("builder.rateShort")} error={fieldError("rate") ?? (submitted && !currency ? t("proposal.leadCurrencyRequired") : undefined)}><div className="flex"><Input className="relative min-w-0 flex-1 rounded-r-none focus-visible:z-10" aria-label={t("builder.rateShort")} inputMode="decimal" value={terms.rate} aria-invalid={submitted && hasIssue("rate")} onChange={event => change({ rate: event.target.value })} />{currencyField}</div></FormField>
          </div> : <FormField as="div" label={t("builder.listPrice")} error={fieldError("amount") ?? (submitted && !currency ? t("proposal.leadCurrencyRequired") : undefined)}><div className="flex"><Input className="relative min-w-0 flex-1 rounded-r-none focus-visible:z-10" aria-label={t("builder.listPrice")} inputMode="decimal" value={terms.amount} aria-invalid={submitted && hasIssue("amount")} onChange={event => change({ amount: event.target.value })} />{currencyField}</div></FormField>}
          {list && !priceInvalid && terms.pricingMethod === "area" ? <p data-lead-price-formula className="text-sm tabular-nums text-[var(--ui-text-secondary)]">{number(terms.area)} м² × {number(terms.rate)} {terms.currency}/м² = {money(list)}</p> : null}
          {submitted && priceInvalid ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("proposal.leadPriceInvalid")}</p> : null}
        </section>
        <section className="min-w-0 space-y-4" aria-label={t("builder.schedule")}>
          <h3 className="text-base font-semibold">{t("builder.schedule")}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">{projectPaymentTemplates.map(template => {
            const selected = terms.payments.length === template.length && terms.payments.every((item, index) => Number(item.percentage) === template[index]);
            return <Button key={template.join("/")} type="button" variant="outline" aria-pressed={selected} className={cn("h-auto min-h-11 flex-col gap-0.5 px-2 py-2 text-xs", selected && "bg-[var(--ui-surface-muted)] text-[var(--ui-text)]")} onClick={() => change({ payments: template.map((percentage, index) => ({ id: crypto.randomUUID(), percentage: String(percentage), name: t(`builder.${projectPaymentDefaultKey(template, index)}`, { number: index + 1 }), note: "" })) })}><span>{t("proposal.leadPaymentCount", { count: template.length })}</span><span className="font-normal text-[var(--ui-text-muted)]">{template.join("/")}%</span></Button>;
          })}</div>
          <AnimatedFormContent isOpen className="lead-proposal-payment-list"><div className="space-y-3">{terms.payments.map((item, index) => <div key={item.id} className="space-y-1.5">
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_2.75rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_7rem_2.75rem] md:grid-cols-[minmax(0,1fr)_4.5rem_2.75rem] lg:grid-cols-[minmax(0,1fr)_4.5rem_7rem_2.75rem]">
              <Input aria-label={`${t("builder.paymentName")} ${index + 1}`} value={item.name} maxLength={2000} aria-invalid={submitted && hasIssue("payments", index, "name")} onChange={event => editPayment(index, { name: event.target.value })} />
              <div className="relative"><Input className="pr-6 tabular-nums" aria-label={`${t("builder.percentage")} ${index + 1}`} inputMode="decimal" value={item.percentage} aria-invalid={submitted && hasIssue("payments", index, "percentage")} onChange={event => editPayment(index, { percentage: event.target.value.replace(",", ".") })} /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ui-text-muted)]">%</span></div>
              <span className="col-span-2 row-start-2 text-xs tabular-nums text-[var(--ui-text-secondary)] sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:text-right md:col-span-2 md:col-start-1 md:row-start-2 md:text-left lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:text-right">{payments[index] ? money(payments[index]) : "—"}</span>
              <Button type="button" variant="ghost" className="col-start-3 row-start-1 size-11 p-0 sm:col-start-4 md:col-start-3 lg:col-start-4" aria-label={`${t("builder.remove")} ${index + 1}`} disabled={terms.payments.length === 1} onClick={() => change({ payments: terms.payments.filter(row => row.id !== item.id) })}><Trash2 className="size-4" aria-hidden="true" /></Button>
            </div>
            {fieldError("payments", index, "name") || fieldError("payments", index, "percentage") ? <p className="text-xs text-[var(--ui-danger-text)]">{fieldError("payments", index, "name") || fieldError("payments", index, "percentage")}</p> : null}
          </div>)}</div></AnimatedFormContent>
          <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="ghost" size="sm" className="min-h-11 gap-2 px-0" onClick={() => change({ payments: [...terms.payments, { id: crypto.randomUUID(), name: t("builder.paymentNumber", { number: terms.payments.length + 1 }), percentage: "", note: "" }] })}><Plus className="size-4" aria-hidden="true" />{t("proposal.leadAddPayment")}</Button><span className={cn("text-xs tabular-nums", submitted && scheduleInvalid && !priceInvalid ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text-muted)]")}>{t("proposal.leadPaymentTotal", { percent: percentageTotal })}</span></div>
          {submitted && scheduleInvalid && !priceInvalid ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("proposal.leadScheduleInvalid")}</p> : null}
        </section>
      </div>
      <div data-lead-proposal-options className="grid min-w-0 gap-x-8 gap-y-2 md:grid-cols-2">
        <AnimatedDisclosure title={t("proposal.leadPriceOptions")} open={optionsOpen} onOpenChange={setOptionsOpen}>
          <div className="space-y-3 pb-3 pt-1">
            <FormField label={t("builder.discount")}><Select value={terms.discountType} onValueChange={value => { if (value === "none" || value === "percentage" || value === "fixed") change({ discountType: value, discountValue: "0" }); }}><SelectItem value="none">{t("builder.discountNone")}</SelectItem><SelectItem value="percentage">{t("builder.discountPercent")}</SelectItem><SelectItem value="fixed">{t("builder.discountFixed")}</SelectItem></Select></FormField>
            {terms.discountType !== "none" ? <FormField label={t(terms.discountType === "percentage" ? "builder.discountPercent" : "builder.discountAmount")} error={fieldError("discountValue")}><Input inputMode="decimal" value={terms.discountValue} aria-invalid={submitted && hasIssue("discountValue")} onChange={event => change({ discountValue: event.target.value })} /></FormField> : null}
            <FinanceVatControls hidePreview amount={amount} vatRate={terms.vatRate} priceBasis={terms.priceBasis} digits={digits} money={money} onRateChange={value => change({ vatRate: value, priceBasis: value === null ? null : terms.priceBasis ?? "gross" })} onBasisChange={value => change({ priceBasis: value })} labels={{ vat: t("builder.vat"), rate: t("builder.vatRate"), custom: t("builder.vatOther"), none: t("builder.vatNone"), basis: t("builder.priceBasis"), net: t("builder.netShort"), gross: t("builder.grossShort"), customRate: t("builder.customRate") }} />
          </div>
        </AnimatedDisclosure>
        <AnimatedDisclosure title={t("proposal.leadPaymentNotes")} open={notesOpen} onOpenChange={setNotesOpen}><div className="space-y-3 pb-1 pt-1">{terms.payments.map((item, index) => <FormField key={item.id} label={item.name} error={fieldError("payments", index, "note")}><Textarea rows={2} maxLength={300} value={item.note} onChange={event => editPayment(index, { note: event.target.value })} /></FormField>)}</div></AnimatedDisclosure>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm text-[var(--ui-text-secondary)]">{t("proposal.leadTotal")}</span><strong className="text-xl font-semibold tabular-nums">{gross && !priceInvalid ? money(gross) : "—"}</strong></div>
      {terms.vatRate !== null && gross && !priceInvalid ? <p className="text-xs text-[var(--ui-text-muted)]">{t("builder.vatIncluded")} · {terms.vatRate}%</p> : null}
    </fieldset>
  </form>;
}
