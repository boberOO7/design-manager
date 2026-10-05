"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ChevronRight, LoaderCircle, Pencil, Plus, X } from "lucide-react";
import { saveFinanceProjectOrder } from "@/app/(app)/finance/project-orders/actions";
import type { FinanceProjectData, getFinanceData } from "@/data/queries/finance";
import { formatFinanceAmount } from "@/lib/finance";
import { formatProjectFinanceMoney, projectOrderPaymentProgress, type ProjectFinanceDisplay } from "@/lib/finance-project-view";
import { parseProjectOrderDraft } from "@/lib/finance-project-orders";
import { projectDiscountAmounts, projectRevenueTaxAmounts, projectVatAmounts } from "@/lib/finance-project-plan";
import { formatDateOnly } from "@/lib/utils";
import { orderPaymentStateClass } from "./order-payment-progress";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/form-field";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FinanceActionForm } from "./finance-action-form";
import { ProjectValueBuilder } from "./project-value-builder";

const ProposalEditor = dynamic(() => import("./proposal/editor"), { ssr: false });
type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
type Props = { project: FinanceProjectData; currencies: Foundation["currencies"]; reportingCurrency: string; initialOrderId?: string; display?: ProjectFinanceDisplay; onClose: () => void };

export function ProjectOrdersManager({ project, currencies, reportingCurrency, initialOrderId, display, onClose }: Props) {
  const t = useTranslations("Finance"), locale = useLocale();
  const [selectedId, setSelectedId] = useState(initialOrderId ?? ""), [adding, setAdding] = useState(false);
  const [editor, setEditor] = useState<"pricing" | "proposal" | null>(null), [pending, setPending] = useState(false);
  const [renaming, setRenaming] = useState(false), [nameValue, setNameValue] = useState(""), [nameError, setNameError] = useState("");
  const nameButton = useRef<HTMLButtonElement>(null), nameForm = useRef<HTMLFormElement>(null);
  const renameInFlight = useRef(false), restoreNameFocus = useRef(false);
  const nameErrorId = useId();
  const order = project.orders.find(item => item.id === selectedId);
  const term = project.terms.find(item => item.order_id === order?.id && item.stream === "design");
  const draft = order ? parseProjectOrderDraft(order.draft_plan, project.projectId, order.id) : null;
  const currency = currencies.find(item => item.code === (term?.currency ?? draft?.currency));
  const nativeMoney = (value: string | number | null | undefined, code = currency?.code) => {
    const unit = currencies.find(item => item.code === code);
    return value == null || !unit ? "—" : formatFinanceAmount(value, unit, locale);
  };
  const money = (value: string | number | null | undefined, code = currency?.code) => formatProjectFinanceMoney(value, currencies.find(unit => unit.code === code), display, locale);
  const totals = project.orderTotals.find(item => item.order_id === order?.id);
  const paymentProgress = projectOrderPaymentProgress(totals, currency?.minor_units ?? 2);
  const pricing = project.planRevisions.find(item => item.terms_id === term?.id);
  const discount = draft && currency ? projectDiscountAmounts(draft.amount, draft.discountType, draft.discountValue, currency.minor_units) : null;
  const amounts = draft && currency && discount ? projectVatAmounts(discount.agreed, draft.vatRate, draft.priceBasis, currency.minor_units) : null;
  const net = term?.net_amount ?? amounts?.net;
  const taxRate = term?.revenue_tax_rate ?? draft?.revenueTaxRate;
  const revenueTax = net != null && taxRate != null && currency ? projectRevenueTaxAmounts(String(net), String(taxRate), currency.minor_units) : null;
  const orderFields = order ? <><input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="version" value={order.version}/></> : null;

  useEffect(() => {
    if (renaming) { const input = nameForm.current?.querySelector<HTMLInputElement>('input[name="name"]'); input?.focus(); input?.select(); }
    else if (restoreNameFocus.current) { restoreNameFocus.current = false; nameButton.current?.focus(); }
  }, [renaming]);

  function cancelRename() {
    if (renameInFlight.current) return;
    restoreNameFocus.current = true;
    setNameError("");
    setRenaming(false);
  }

  function submitRename(returnFocus: boolean) {
    if (!order || renameInFlight.current) return;
    restoreNameFocus.current = returnFocus;
    const name = nameValue.trim();
    if (name === order.name) { setRenaming(false); return; }
    if (!name) { setNameError(t("orders.errors.invalid")); return; }
    renameInFlight.current = true;
    setPending(true);
    nameForm.current?.requestSubmit();
  }

  function closeManager(reason: "escape" | "outside" | "explicit") {
    if (pending || renameInFlight.current) return;
    if (renaming) {
      if (reason === "escape") cancelRename();
      else if (reason === "explicit") { cancelRename(); onClose(); }
      else submitRename(false);
      return;
    }
    onClose();
  }

  function renderOrder(item: FinanceProjectData["orders"][number]) {
    const current = project.terms.find(term => term.order_id === item.id && term.stream === "design");
    const plan = parseProjectOrderDraft(item.draft_plan, project.projectId, item.id);
    const unit = currencies.find(currency => currency.code === plan?.currency);
    const draftGross = plan && unit ? projectVatAmounts(projectDiscountAmounts(plan.amount, plan.discountType, plan.discountValue, unit.minor_units).agreed, plan.vatRate, plan.priceBasis, unit.minor_units).gross : null;
    const orderTotal = project.orderTotals.find(total => total.order_id === item.id);
    const payment = projectOrderPaymentProgress(orderTotal, currencies.find(currency => currency.code === orderTotal?.currency)?.minor_units ?? 2);
    return <li key={item.id}><button type="button" onClick={() => setSelectedId(item.id)} className="group grid min-h-14 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 rounded-[var(--ui-radius-control)] px-2 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] active:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none">
      <span className="min-w-0"><span className="block break-words text-sm font-medium">{item.name}</span><span className="mt-0.5 block text-xs text-[var(--ui-text-secondary)]">{item.status === "confirmed" ? <span className={orderPaymentStateClass(payment.state)}>{t(`orders.paymentStates.${payment.state}`)}</span> : t(`orders.status.${item.status}`)} · {t("orders.paymentCountCompact", { count: project.orderTotals.find(total => total.order_id === item.id)?.payment_count ?? plan?.items.length ?? 0 })}</span></span>
      <span className="ui-numeric shrink-0 self-start whitespace-nowrap pt-0.5 text-right text-sm font-medium">{money(current?.gross_amount ?? draftGross, current?.currency ?? plan?.currency)}{display && (current?.currency ?? plan?.currency) !== display.currency.code ? <span className="mt-1 block text-xs font-normal text-[var(--ui-text-muted)]">{nativeMoney(current?.gross_amount ?? draftGross, current?.currency ?? plan?.currency)}</span> : null}</span>
      <ChevronRight aria-hidden="true" className="size-4 text-[var(--ui-text-muted)] transition-colors duration-200 group-hover:text-[var(--ui-text)] motion-reduce:transition-none"/>
    </button></li>;
  }

  return <>
    <Dialog isOpen={editor === null} onRequestClose={closeManager} closeDisabled={pending} title={order ? undefined : t("orders.title")} ariaLabel={order?.name} hideHeader={Boolean(order)} closeLabel={t("movements.close")} className={`h-auto max-h-[calc(100dvh-1rem)] sm:max-w-[38rem] ${order ? "" : "[&>header]:items-center [&>header]:gap-2 [&>header]:px-4 [&>header]:py-2"}`} headerActions={!order && !adding ? <Button variant="ghost" size="sm" onClick={() => setAdding(true)} className="min-h-11 gap-1 px-1 text-xs sm:px-2 sm:text-sm"><Plus aria-hidden="true" className="size-4"/>{t("orders.add")}</Button> : undefined}>
      {order ? <header className="flex shrink-0 items-start gap-1 px-3 pb-3 pt-3 sm:px-4">
        <Button variant="ghost" className="size-11 shrink-0 p-0" aria-label={t("orders.back")} disabled={pending} onClick={() => { setRenaming(false); setNameError(""); setSelectedId(""); }}><ArrowLeft aria-hidden="true" className="size-4"/></Button>
        <div className="min-w-0 flex-1">
          {renaming ? <FinanceActionForm key={order.id} action={saveFinanceProjectOrder} label={t("orders.rename")} hideActions showMessage={false} formRef={nameForm} className="space-y-1" fieldsetClassName="min-w-0" onPending={value => { renameInFlight.current = value; setPending(value); }} onResult={result => { setNameError(result.status === "error" ? result.message ?? t("orders.errors.save") : ""); }} onSaved={() => setRenaming(false)}>
            {orderFields}<input type="hidden" name="intent" value="rename"/>
            <div className="relative"><Input name="name" value={nameValue} aria-label={t("orders.name")} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? nameErrorId : undefined} required maxLength={2000} className="h-11 pr-8 text-lg font-semibold" onChange={event => { setNameValue(event.target.value); setNameError(""); }} onBlur={() => submitRename(false)} onKeyDown={event => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") { event.preventDefault(); submitRename(true); }
              else if (event.key === "Escape") { event.preventDefault(); cancelRename(); }
            }}/>{pending ? <LoaderCircle aria-hidden="true" className="absolute right-2 top-3.5 size-4 animate-spin motion-reduce:animate-none"/> : null}</div>
            {nameError ? <p id={nameErrorId} role="alert" className="text-xs text-[var(--ui-danger-text)]">{nameError}</p> : null}
            {pending ? <span role="status" className="sr-only">{t("movements.saving")}</span> : null}
          </FinanceActionForm> : <h2 aria-label={order.name} className="text-lg font-semibold text-[var(--ui-text)]">{order.status === "discarded" ? <span className="block py-2 break-words">{order.name}</span> : <button ref={nameButton} type="button" aria-label={t("orders.editName")} disabled={pending} onClick={() => { setNameValue(order.name); setNameError(""); setRenaming(true); }} className="group flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--ui-radius-control)] px-1 text-left transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-wait motion-reduce:transition-none"><span className="min-w-0 break-words">{order.name}</span><Pencil aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-muted)] group-hover:text-[var(--ui-text-secondary)]"/></button>}</h2>}
          <p className="px-1 text-xs text-[var(--ui-text-secondary)]">{order.status === "confirmed" ? <span className={orderPaymentStateClass(paymentProgress.state)}>{t(`orders.paymentStates.${paymentProgress.state}`)} · {t("orders.paymentCountCompact", { count: totals?.payment_count ?? 0 })}</span> : t(`orders.status.${order.status}`)}</p>
        </div>
        <Button variant="ghost" className="size-11 shrink-0 p-0" aria-label={t("movements.close")} aria-disabled={pending} onClick={() => closeManager("explicit")}><X aria-hidden="true" className="size-5"/></Button>
      </header> : null}
      <div className={`min-h-0 overflow-y-auto overscroll-contain ${order ? "space-y-4 px-4 pb-2 sm:px-6" : adding ? "space-y-3 p-4 pt-3" : "space-y-2 p-2"}`}>
        {adding ? <Button variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={pending}><ArrowLeft aria-hidden="true" className="mr-2 size-4"/>{t("orders.back")}</Button> : null}
        {adding ? <FinanceActionForm action={saveFinanceProjectOrder} label={t("orders.create")} onPending={setPending} onSaved={result => { setAdding(false); setSelectedId(result.id ?? ""); }}>
          <input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="intent" value="create"/>
          <FormField label={t("orders.name")}><Input name="name" defaultValue={project.orders.length ? "" : t("orders.defaultName")} required maxLength={2000}/></FormField>
          <p className="text-sm text-[var(--ui-text-secondary)]">{t("orders.draftHelp")}</p>
        </FinanceActionForm> : order ? <>
          <div className="grid grid-cols-2 items-end gap-x-5 gap-y-4 py-1 sm:grid-cols-[1.2fr_1fr_1.15fr]">
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <p className="ui-numeric break-words text-2xl font-semibold tracking-tight text-[var(--ui-text)]">{money(term?.gross_amount ?? amounts?.gross)}</p>
              {display && currency && currency.code !== display.currency.code ? <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{nativeMoney(term?.gross_amount ?? amounts?.gross)}</p> : null}
              <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("builder.netShort")} <span className="ui-numeric">{money(net)}</span></p>
            </div>
            {totals ? <dl className="col-span-2 grid grid-cols-subgrid gap-x-5 sm:col-span-2">
              <div className="min-w-0"><dt className="text-xs text-[var(--ui-text-secondary)]">{t("project.outstanding")}</dt><dd className="ui-numeric mt-1 break-words text-sm font-medium text-[var(--ui-text)]">{money(totals.outstanding_amount)}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-[var(--ui-text-secondary)]">{t("project.planned")}</dt><dd className="ui-numeric mt-1 break-words text-sm font-medium text-[var(--ui-text)]">{money(totals.planned_amount)}</dd></div>
            </dl> : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="h-auto min-h-11 justify-between gap-2 whitespace-normal px-3 text-left" disabled={pending || order.status === "discarded"} onClick={() => setEditor("pricing")}>{t("project.editAgreement")}<ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)]"/></Button>
            <Button variant="outline" className="h-auto min-h-11 justify-between gap-2 whitespace-normal px-3 text-left" disabled={pending || (!term && !draft)} onClick={() => setEditor("proposal")}>{t("proposal.action")}<ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)]"/></Button>
          </div>
          {order.status === "draft" ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("orders.draftHelp")}</p> : null}
          {(term?.vat_rate ?? draft?.vatRate) != null || revenueTax ? <dl className="flex flex-wrap gap-x-7 gap-y-3 text-xs text-[var(--ui-text-secondary)]">
            {(term?.vat_rate ?? draft?.vatRate) != null ? <div><dt>{t("builder.vat")} · {term?.vat_rate ?? draft?.vatRate}%</dt><dd className="ui-numeric mt-1 font-medium">{money(term?.vat_amount ?? amounts?.vat)}</dd></div> : null}
            {revenueTax ? <><div><dt>{t("builder.revenueTax")} · {taxRate}%</dt><dd className="ui-numeric mt-1 font-medium">{money(revenueTax.tax)}</dd></div><div><dt>{t("builder.afterTax")}</dt><dd className="ui-numeric mt-1 font-medium">{money(revenueTax.afterTax)}</dd></div></> : null}
          </dl> : null}
          {Number(term?.discount_amount ?? discount?.discount ?? 0) > 0 ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("builder.discountWithPercent", { percent: discount?.percentage ?? projectDiscountAmounts(String(term?.amount), term?.discount_type === "fixed" ? "fixed" : "percentage", String(term?.discount_value), currency?.minor_units ?? 2).percentage })} · −{money(term?.discount_amount ?? discount?.discount)}</p> : null}
          {pricing?.pricing_method === "area" || draft?.pricingMethod === "area" ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("builder.areaSummary", { area: pricing?.area_snapshot ?? draft?.area ?? "", rate: `${pricing?.rate_per_m2 ?? draft?.rate ?? ""} ${currency?.code ?? ""}` })}</p> : null}
          {pricing?.pricing_method === "area" && project.area !== null && Number(pricing.area_snapshot) !== project.area ? <p className="text-xs text-[var(--ui-warning-text)]">{t("builder.areaChanged", { saved: pricing.area_snapshot ?? 0, current: project.area })}</p> : null}
          {totals && Number(totals.unscheduled_amount) > 0 ? <p className="text-sm text-[var(--ui-warning-text)]">{t("project.unscheduledAction", { amount: money(totals.unscheduled_amount) })}</p> : null}
          {totals && Number(totals.closed_amount) > 0 ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("orders.closed")}: {money(totals.closed_amount)}</p> : null}
          {totals && (Number(totals.scheduled_vat_amount) > 0 || Number(totals.collected_vat_amount) > 0) ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("project.historicalVatBreakdown", { scheduledNet: money(totals.scheduled_net_amount), scheduledVat: money(totals.scheduled_vat_amount), collectedNet: money(totals.collected_net_amount), collectedVat: money(totals.collected_vat_amount) })}</p> : null}
          {order.status === "draft" ? <>
            {draft ? <FinanceActionForm action={saveFinanceProjectOrder} label={t("orders.confirm")} onSaved={() => {}} onPending={setPending} className="space-y-3 border-t border-[var(--ui-border)] pt-4">{orderFields}<input type="hidden" name="intent" value="confirm"/><p className="text-sm">{t("orders.confirmHelp")}</p><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" required/>{t("orders.confirmCheck")}</label></FinanceActionForm> : <p className="text-sm text-[var(--ui-text-muted)]">{t("orders.noPlan")}</p>}
            <AnimatedDisclosure title={t("orders.discard")}><FinanceActionForm action={saveFinanceProjectOrder} label={t("orders.discard")} onSaved={() => setSelectedId("")} onPending={setPending} className="space-y-3 pt-3" submitClassName="bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]">{orderFields}<input type="hidden" name="intent" value="discard"/><p className="text-xs text-[var(--ui-text-secondary)]">{t("orders.discardHelp")}</p><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" required/>{t("orders.discardCheck")}</label></FinanceActionForm></AnimatedDisclosure>
          </> : null}
          {term ? <AnimatedDisclosure title={t("project.history")} className="border-t border-[var(--ui-border)] pt-1"><ul className="space-y-3 pb-3 pt-2">{project.termHistory.filter(item => item.order_id === order.id).map(item => {
            const unit = currencies.find(unit => unit.code === item.currency);
            const tax = item.revenue_tax_rate !== null && item.net_amount !== null && unit ? projectRevenueTaxAmounts(String(item.net_amount),String(item.revenue_tax_rate),unit.minor_units) : null;
            const plan = project.planRevisions.find(plan => plan.terms_id === item.id);
            return <li key={item.id} className="space-y-1 text-xs text-[var(--ui-text-secondary)]"><p className="text-sm font-medium text-[var(--ui-text)]">{t("project.revision", { version: item.revision })} · {nativeMoney(item.amount, item.currency)}{item.price_basis ? ` · ${t(item.price_basis === "net" ? "builder.net" : "builder.gross")}` : ""}</p>
              {Number(item.discount_amount) > 0 ? <p>{t("builder.discountWithPercent",{percent:projectDiscountAmounts(String(item.amount),item.discount_type === "fixed" ? "fixed" : "percentage",String(item.discount_value),unit?.minor_units ?? 2).percentage})} · −{nativeMoney(item.discount_amount,item.currency)}</p> : null}
              {item.vat_rate !== null ? <p>{t("project.vatBreakdown",{net:nativeMoney(item.net_amount,item.currency),vat:nativeMoney(item.vat_amount,item.currency),gross:nativeMoney(item.gross_amount,item.currency)})}</p> : null}
              {tax ? <p>{t("project.revenueTaxEstimate",{rate:item.revenue_tax_rate ?? 0,tax:nativeMoney(tax.tax,item.currency),afterTax:nativeMoney(tax.afterTax,item.currency)})}</p> : null}
              {plan?.pricing_method === "area" ? <p>{t("builder.areaSummary",{area:plan.area_snapshot ?? 0,rate:`${plan.rate_per_m2} ${item.currency}`})}</p> : null}
              <p>{formatDateOnly(item.created_at.slice(0,10),locale)} · {item.reason}</p></li>;
          })}</ul></AnimatedDisclosure> : null}
        </> : <>
          {project.orders.some(item => item.status !== "discarded") ? <ul className="divide-y divide-[var(--ui-border-subtle)]">{project.orders.filter(item => item.status !== "discarded").map(renderOrder)}</ul> : <p className="py-4 text-sm text-[var(--ui-text-secondary)]">{t("orders.empty")}</p>}
          {project.orders.some(item => item.status === "discarded") ? <AnimatedDisclosure title={t("orders.history")}><ul>{project.orders.filter(item => item.status === "discarded").map(renderOrder)}</ul></AnimatedDisclosure> : null}
        </>}
      </div>
    </Dialog>
    {editor === "pricing" && order ? <Dialog isOpen title={`${order.name} · ${t("project.editAgreement")}`} closeLabel={t("movements.close")} onRequestClose={() => setEditor(null)} closeDisabled={pending} className="sm:!max-w-[70rem]"><div className="min-h-0 overflow-y-auto overscroll-contain"><ProjectValueBuilder key={`${order.id}-${order.version}`} order={order} project={project} currencies={currencies} reportingCurrency={reportingCurrency} onSaved={() => setEditor(null)} onPending={setPending}/></div></Dialog> : null}
    {editor === "proposal" && order ? <ProposalEditor projectId={project.projectId} orderId={order.id} orderName={order.name} readOnly={order.status === "discarded"} onClose={() => setEditor(null)}/> : null}
  </>;
}
