"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Plus } from "lucide-react";
import { saveFinanceProjectOrder } from "@/app/(app)/finance/project-orders/actions";
import type { FinanceProjectData, getFinanceData } from "@/data/queries/finance";
import { formatFinanceAmount } from "@/lib/finance";
import { parseProjectOrderDraft } from "@/lib/finance-project-orders";
import { projectDiscountAmounts, projectRevenueTaxAmounts, projectVatAmounts } from "@/lib/finance-project-plan";
import { formatDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/form-field";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FinanceActionForm } from "./finance-action-form";
import { ProjectValueBuilder } from "./project-value-builder";

const ProposalEditor = dynamic(() => import("./proposal/editor"), { ssr: false });
type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
type Props = { project: FinanceProjectData; currencies: Foundation["currencies"]; reportingCurrency: string; initialOrderId?: string; onClose: () => void };

export function ProjectOrdersManager({ project, currencies, reportingCurrency, initialOrderId, onClose }: Props) {
  const t = useTranslations("Finance"), locale = useLocale();
  const [selectedId, setSelectedId] = useState(initialOrderId ?? ""), [adding, setAdding] = useState(false);
  const [editor, setEditor] = useState<"pricing" | "proposal" | null>(null), [pending, setPending] = useState(false);
  const order = project.orders.find(item => item.id === selectedId);
  const term = project.terms.find(item => item.order_id === order?.id && item.stream === "design");
  const draft = order ? parseProjectOrderDraft(order.draft_plan, project.projectId, order.id) : null;
  const currency = currencies.find(item => item.code === (term?.currency ?? draft?.currency));
  const money = (value: string | number | null | undefined, code = currency?.code) => {
    const unit = currencies.find(item => item.code === code);
    return value == null || !unit ? "—" : formatFinanceAmount(value, unit, locale);
  };
  const totals = project.orderTotals.find(item => item.order_id === order?.id);
  const pricing = project.planRevisions.find(item => item.terms_id === term?.id);
  const discount = draft && currency ? projectDiscountAmounts(draft.amount, draft.discountType, draft.discountValue, currency.minor_units) : null;
  const amounts = draft && currency && discount ? projectVatAmounts(discount.agreed, draft.vatRate, draft.priceBasis, currency.minor_units) : null;
  const net = term?.net_amount ?? amounts?.net;
  const taxRate = term?.revenue_tax_rate ?? draft?.revenueTaxRate;
  const revenueTax = net != null && taxRate != null && currency ? projectRevenueTaxAmounts(String(net), String(taxRate), currency.minor_units) : null;
  const orderFields = order ? <><input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="version" value={order.version}/></> : null;

  function renderOrder(item: FinanceProjectData["orders"][number]) {
    const current = project.terms.find(term => term.order_id === item.id && term.stream === "design");
    const plan = parseProjectOrderDraft(item.draft_plan, project.projectId, item.id);
    const unit = currencies.find(currency => currency.code === plan?.currency);
    const draftGross = plan && unit ? projectVatAmounts(projectDiscountAmounts(plan.amount, plan.discountType, plan.discountValue, unit.minor_units).agreed, plan.vatRate, plan.priceBasis, unit.minor_units).gross : null;
    return <li key={item.id}><button type="button" onClick={() => setSelectedId(item.id)} className="flex min-h-16 w-full flex-wrap items-center justify-between gap-2 rounded-[var(--ui-radius-control)] px-3 py-3 text-left transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none">
      <span className="min-w-0"><span className="block break-words text-sm font-medium">{item.name}</span><span className="mt-1 block text-xs text-[var(--ui-text-secondary)]">{t(`orders.status.${item.status}`)} · {t("orders.payments", { count: project.orderTotals.find(total => total.order_id === item.id)?.payment_count ?? plan?.items.length ?? 0 })}</span></span>
      <span className="ui-numeric text-sm font-semibold">{money(current?.gross_amount ?? draftGross, current?.currency ?? plan?.currency)}</span>
    </button></li>;
  }

  return <>
    <Dialog isOpen={editor === null} onRequestClose={onClose} closeDisabled={pending} title={order?.name ?? t("orders.title")} closeLabel={t("movements.close")} className="sm:max-w-[46rem]">
      <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {order || adding ? <Button variant="ghost" size="sm" onClick={() => { setSelectedId(""); setAdding(false); }} disabled={pending}><ArrowLeft aria-hidden="true" className="mr-2 size-4"/>{t("orders.back")}</Button> : null}
        {adding ? <FinanceActionForm action={saveFinanceProjectOrder} label={t("orders.create")} onPending={setPending} onSaved={result => { setAdding(false); setSelectedId(result.id ?? ""); }}>
          <input type="hidden" name="projectId" value={project.projectId}/><input type="hidden" name="intent" value="create"/>
          <FormField label={t("orders.name")}><Input name="name" defaultValue={project.orders.length ? "" : t("orders.defaultName")} required maxLength={2000}/></FormField>
          <p className="text-sm text-[var(--ui-text-secondary)]">{t("orders.draftHelp")}</p>
        </FinanceActionForm> : order ? <>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-medium text-[var(--ui-text-secondary)]">{t(`orders.status.${order.status}`)}</span><span className="ui-numeric text-2xl font-semibold">{money(term?.gross_amount ?? amounts?.gross)}</span></div>
          {order.status === "draft" ? <p className="text-sm text-[var(--ui-text-secondary)]">{t("orders.draftHelp")}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={order.status === "discarded"} onClick={() => setEditor("pricing")}>{t("project.editAgreement")}</Button>
            <Button variant="outline" disabled={!term && !draft} onClick={() => setEditor("proposal")}>{t("proposal.action")}</Button>
          </div>
          <dl className="flex flex-wrap gap-x-7 gap-y-3 text-xs text-[var(--ui-text-secondary)]">
            <div><dt>{t("builder.netShort")}</dt><dd className="ui-numeric mt-1 font-medium">{money(net)}</dd></div>
            {(term?.vat_rate ?? draft?.vatRate) != null ? <div><dt>{t("builder.vat")} · {term?.vat_rate ?? draft?.vatRate}%</dt><dd className="ui-numeric mt-1 font-medium">{money(term?.vat_amount ?? amounts?.vat)}</dd></div> : null}
            {revenueTax ? <><div><dt>{t("builder.revenueTax")} · {taxRate}%</dt><dd className="ui-numeric mt-1 font-medium">{money(revenueTax.tax)}</dd></div><div><dt>{t("builder.afterTax")}</dt><dd className="ui-numeric mt-1 font-medium">{money(revenueTax.afterTax)}</dd></div></> : null}
          </dl>
          {Number(term?.discount_amount ?? discount?.discount ?? 0) > 0 ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("builder.discountWithPercent", { percent: discount?.percentage ?? projectDiscountAmounts(String(term?.amount), term?.discount_type === "fixed" ? "fixed" : "percentage", String(term?.discount_value), currency?.minor_units ?? 2).percentage })} · −{money(term?.discount_amount ?? discount?.discount)}</p> : null}
          {pricing?.pricing_method === "area" || draft?.pricingMethod === "area" ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("builder.areaSummary", { area: pricing?.area_snapshot ?? draft?.area ?? "", rate: `${pricing?.rate_per_m2 ?? draft?.rate ?? ""} ${currency?.code ?? ""}` })}</p> : null}
          {pricing?.pricing_method === "area" && project.area !== null && Number(pricing.area_snapshot) !== project.area ? <p className="text-xs text-[var(--ui-warning-text)]">{t("builder.areaChanged", { saved: pricing.area_snapshot ?? 0, current: project.area })}</p> : null}
          {totals && Number(totals.unscheduled_amount) > 0 ? <p className="text-sm text-[var(--ui-warning-text)]">{t("project.unscheduledAction", { amount: money(totals.unscheduled_amount) })}</p> : null}
          {totals && Number(totals.closed_amount) > 0 ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("orders.closed")}: {money(totals.closed_amount)}</p> : null}
          {totals && (Number(totals.scheduled_vat_amount) > 0 || Number(totals.collected_vat_amount) > 0) ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("project.historicalVatBreakdown", { scheduledNet: money(totals.scheduled_net_amount), scheduledVat: money(totals.scheduled_vat_amount), collectedNet: money(totals.collected_net_amount), collectedVat: money(totals.collected_vat_amount) })}</p> : null}
          {totals ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("project.outstanding")}: {money(totals.outstanding_amount)} · {t("project.planned")}: {money(totals.planned_amount)}</p> : null}
          {order.status !== "discarded" ? <AnimatedDisclosure title={t("orders.name")}><FinanceActionForm key={`${order.id}-${order.version}`} action={saveFinanceProjectOrder} label={t("orders.rename")} onSaved={() => {}} onPending={setPending} className="space-y-3 pt-3">{orderFields}<input type="hidden" name="intent" value="rename"/><FormField label={t("orders.name")}><Input name="name" defaultValue={order.name} required maxLength={2000}/></FormField></FinanceActionForm></AnimatedDisclosure> : null}
          {order.status === "draft" ? <>
            {draft ? <FinanceActionForm action={saveFinanceProjectOrder} label={t("orders.confirm")} onSaved={() => {}} onPending={setPending} className="space-y-3 border-t border-[var(--ui-border)] pt-4">{orderFields}<input type="hidden" name="intent" value="confirm"/><p className="text-sm">{t("orders.confirmHelp")}</p><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" required/>{t("orders.confirmCheck")}</label></FinanceActionForm> : <p className="text-sm text-[var(--ui-text-muted)]">{t("orders.noPlan")}</p>}
            <AnimatedDisclosure title={t("orders.discard")}><FinanceActionForm action={saveFinanceProjectOrder} label={t("orders.discard")} onSaved={() => setSelectedId("")} onPending={setPending} className="space-y-3 pt-3" submitClassName="bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]">{orderFields}<input type="hidden" name="intent" value="discard"/><p className="text-xs text-[var(--ui-text-secondary)]">{t("orders.discardHelp")}</p><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" required/>{t("orders.discardCheck")}</label></FinanceActionForm></AnimatedDisclosure>
          </> : null}
          {term ? <AnimatedDisclosure title={t("project.history")}><ul className="space-y-3 pt-3">{project.termHistory.filter(item => item.order_id === order.id).map(item => {
            const unit = currencies.find(unit => unit.code === item.currency);
            const tax = item.revenue_tax_rate !== null && item.net_amount !== null && unit ? projectRevenueTaxAmounts(String(item.net_amount),String(item.revenue_tax_rate),unit.minor_units) : null;
            const plan = project.planRevisions.find(plan => plan.terms_id === item.id);
            return <li key={item.id} className="space-y-1 text-xs text-[var(--ui-text-secondary)]"><p className="text-sm font-medium text-[var(--ui-text)]">{t("project.revision", { version: item.revision })} · {money(item.amount, item.currency)}{item.price_basis ? ` · ${t(item.price_basis === "net" ? "builder.net" : "builder.gross")}` : ""}</p>
              {Number(item.discount_amount) > 0 ? <p>{t("builder.discountWithPercent",{percent:projectDiscountAmounts(String(item.amount),item.discount_type === "fixed" ? "fixed" : "percentage",String(item.discount_value),unit?.minor_units ?? 2).percentage})} · −{money(item.discount_amount,item.currency)}</p> : null}
              {item.vat_rate !== null ? <p>{t("project.vatBreakdown",{net:money(item.net_amount,item.currency),vat:money(item.vat_amount,item.currency),gross:money(item.gross_amount,item.currency)})}</p> : null}
              {tax ? <p>{t("project.revenueTaxEstimate",{rate:item.revenue_tax_rate ?? 0,tax:money(tax.tax,item.currency),afterTax:money(tax.afterTax,item.currency)})}</p> : null}
              {plan?.pricing_method === "area" ? <p>{t("builder.areaSummary",{area:plan.area_snapshot ?? 0,rate:`${plan.rate_per_m2} ${item.currency}`})}</p> : null}
              <p>{formatDateOnly(item.created_at.slice(0,10),locale)} · {item.reason}</p></li>;
          })}</ul></AnimatedDisclosure> : null}
        </> : <>
          <div className="flex justify-end"><Button onClick={() => setAdding(true)} className="gap-2"><Plus aria-hidden="true" className="size-4"/>{t("orders.add")}</Button></div>
          {project.orders.some(item => item.status !== "discarded") ? <ul className="divide-y divide-[var(--ui-border-subtle)]">{project.orders.filter(item => item.status !== "discarded").map(renderOrder)}</ul> : <p className="py-4 text-sm text-[var(--ui-text-secondary)]">{t("orders.empty")}</p>}
          {project.orders.some(item => item.status === "discarded") ? <AnimatedDisclosure title={t("orders.history")}><ul>{project.orders.filter(item => item.status === "discarded").map(renderOrder)}</ul></AnimatedDisclosure> : null}
        </>}
      </div>
    </Dialog>
    {editor === "pricing" && order ? <Dialog isOpen title={`${order.name} · ${t("project.editAgreement")}`} closeLabel={t("movements.close")} onRequestClose={() => setEditor(null)} closeDisabled={pending} className="sm:!max-w-[70rem]"><div className="min-h-0 overflow-y-auto overscroll-contain"><ProjectValueBuilder key={`${order.id}-${order.version}`} order={order} project={project} currencies={currencies} reportingCurrency={reportingCurrency} onSaved={() => setEditor(null)} onPending={setPending}/></div></Dialog> : null}
    {editor === "proposal" && order ? <ProposalEditor projectId={project.projectId} orderId={order.id} orderName={order.name} readOnly={order.status === "discarded"} onClose={() => setEditor(null)}/> : null}
  </>;
}
