"use client";
import { getStageLabel } from "@/lib/task-stages";
import Link from "next/link";
import { useState } from "react";
import { useProjectWorkspaceRouter as useRouter } from "@/components/projects/project-workspace-navigation";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceProjectData } from "@/data/queries/finance";
import type { FinanceCurrency } from "@/lib/finance";
import { formatFinanceAmount } from "@/lib/finance";
import { earningExceptionKey, type EarningsReport } from "@/lib/finance-earnings";
import { projectAgreementName } from "@/lib/finance-project-view";
import { saveEarningMilestone, fulfillEarningMilestone, voidUnrecognizedEarningMilestone } from "@/app/(app)/finance/project-orders/earning-actions";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { FinanceActionForm } from "./finance-action-form";
import { formatDateOnly } from "@/lib/utils";

type Milestone = EarningsReport["milestones"][number];
type Props = { project: FinanceProjectData; orderId: string; currency: FinanceCurrency; title?: string; onPending?: (pending: boolean) => void };

export function ProjectRevenueRecognition({ project, currencies }: { project: FinanceProjectData; currencies: FinanceCurrency[] }) {
  const t = useTranslations("Finance.earnings"), ordersT = useTranslations("Finance.orders");
  const orders = project.orders.flatMap(order => {
    if (order.status !== "confirmed") return [];
    const term = project.terms.find(term => term.order_id === order.id && term.stream === "design");
    const currency = currencies.find(currency => currency.code === term?.currency);
    return currency ? [{ order, currency }] : [];
  });
  if (!orders.length) return null;
  return <section id="project-revenue-recognition" aria-labelledby="project-revenue-recognition-title" className="min-w-0 space-y-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5">
    <h3 id="project-revenue-recognition-title" className="font-semibold">{t("title")}</h3>
    <p className="text-xs leading-5 text-[var(--ui-text-secondary)]">{t("help")}</p>
    {orders.map(({ order, currency }) => <ProjectEarningMilestones key={order.id} project={project} orderId={order.id} currency={currency} title={projectAgreementName(order.name, ordersT("defaultName"))}/>)}
  </section>;
}

export function ProjectEarningMilestones({ project, orderId, currency, title, onPending = () => {} }: Props) {
  const t = useTranslations("Finance.earnings"), locale = useLocale(), router = useRouter();
  const summary = project.earnings.orders.find(order => order.orderId === orderId);
  const milestones = project.earnings.milestones.filter(milestone => milestone.order_id === orderId);
  const refresh = () => router.refresh();
  const money = (value: string | null) => value === null ? "—" : formatFinanceAmount(value, currency, locale);
  if (!summary) return null;
  const known = summary.configured || summary.hasRecognition;
  return <section data-testid="order-earnings" data-order-id={orderId} className="border-t border-[var(--ui-border)] pt-1">
    <AnimatedDisclosure title={title ?? t("title")}>
      <div className="space-y-4 pb-2 pt-3">
        <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-[var(--ui-text-secondary)]">{t("earned")}</dt><dd className="mt-1 font-medium tabular-nums">{money(known ? summary.earned : null)}</dd></div><div><dt className="text-xs text-[var(--ui-text-secondary)]">{t("unearned")}</dt><dd className="mt-1 font-medium tabular-nums">{money(known ? summary.unearned : null)}</dd></div></dl>
        {!summary.configured ? <p className="text-xs text-[var(--ui-warning-text)]">{t("unconfigured")}</p> : !summary.complete ? <p className="text-xs text-[var(--ui-warning-text)]">{t("partialPlan")}</p> : null}
        <ul className="space-y-4">{milestones.map(milestone => <li key={milestone.id} data-testid="earning-milestone" className="space-y-2 border-b border-[var(--ui-border-subtle)] pb-4 last:border-b-0">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{milestone.title}</p><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t(milestone.condition === "delivery" ? "onDelivery" : "onAcceptance")}</p></div><span className="shrink-0 text-sm tabular-nums">{money(milestone.net_amount)}</span></div>
          {milestone.events.map(event => <p key={event.id} className="text-xs leading-5 text-[var(--ui-text-secondary)]">{t(event.kind)} · {formatDateOnly(event.date, locale)} · {event.actorName}</p>)}
          {milestone.recognized ? <p className="text-xs font-medium">{t("recognized", { amount: money(milestone.earned) })} <Link className="underline underline-offset-2" href={`/finance/reports?project=${project.projectId}`}>{t("history")}</Link></p> : null}
          {milestone.exception && !["finance_recognition_inactive", "finance_posting_boundary"].includes(milestone.exception) ? <div role="status" className="space-y-2 text-xs text-[var(--ui-warning-text)]"><p>{t(`errors.${earningExceptionKey(milestone.exception)}`)}</p><FinanceActionForm action={fulfillEarningMilestone} onSaved={refresh} onPending={onPending} label={t("retry")} className="space-y-2"><input type="hidden" name="intent" value="retry"/><input type="hidden" name="milestoneId" value={milestone.id}/></FinanceActionForm></div> : null}
          {milestone.stale && !milestone.recognized ? <p className="text-xs text-[var(--ui-warning-text)]">{t("errors.stale")}</p> : null}
          {!milestone.events.some(event => event.kind === milestone.condition) ? <FulfillmentForm milestone={milestone} currency={currency} onSaved={refresh} onPending={onPending}/> : null}
          {milestone.events.length > 0 && !milestone.recognized ? <AnimatedDisclosure title={t("correctUnposted")}><FinanceActionForm action={voidUnrecognizedEarningMilestone} onSaved={refresh} onPending={onPending} label={t("closeUnposted")} className="space-y-3 pt-3" fieldsetClassName="space-y-3"><input type="hidden" name="milestoneId" value={milestone.id}/><p className="text-xs leading-5 text-[var(--ui-text-secondary)]">{t("closeUnpostedHelp")}</p><FormField label={t("reason")}><Textarea name="reason" required maxLength={2000} rows={2}/></FormField><label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" name="confirmed" value="true" required className="mt-1"/>{t("confirmVoid")}</label></FinanceActionForm></AnimatedDisclosure> : null}
          {!milestone.events.length ? <AnimatedDisclosure title={t("edit")}><MilestoneForm project={project} orderId={orderId} milestone={milestone} onSaved={refresh} onPending={onPending}/><FinanceActionForm action={saveEarningMilestone} onSaved={refresh} onPending={onPending} label={t("remove")} className="pt-3"><Fields projectId={project.projectId} orderId={orderId} milestone={milestone}/><input type="hidden" name="intent" value="remove"/></FinanceActionForm></AnimatedDisclosure> : null}
        </li>)}</ul>
        <AnimatedDisclosure title={t("add")}><MilestoneForm project={project} orderId={orderId} onSaved={refresh} onPending={onPending}/></AnimatedDisclosure>
      </div>
    </AnimatedDisclosure>
  </section>;
}

function Fields({ projectId, orderId, milestone }: { projectId: string; orderId: string; milestone?: Milestone }) {
  return <><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="id" value={milestone?.id ?? ""}/><input type="hidden" name="revision" value={milestone?.revision ?? 0}/></>;
}

function MilestoneForm({ project, orderId, milestone, onSaved, onPending }: Omit<Props, "currency"> & { milestone?: Milestone; onSaved: () => void }) {
  const t = useTranslations("Finance.earnings"), stageT = useTranslations("TaskStages");
  const [title, setTitle] = useState(milestone?.title ?? ""), [stage, setStage] = useState(milestone?.stage ?? "");
  const [condition, setCondition] = useState(milestone?.condition ?? "delivery");
  const [mode, setMode] = useState(milestone?.percentage ? "share" : "net"), [value, setValue] = useState(milestone?.percentage ?? milestone?.net_amount ?? "");
  const payments = project.planItems.filter(item => item.order_id === orderId && item.net_amount !== null);
  const directionIds = new Set(project.directionLinks.filter(link => link.order_id === orderId).map(link => link.direction_id));
  return <FinanceActionForm action={saveEarningMilestone} label={t("save")} onSaved={onSaved} onPending={onPending} className="space-y-3 pt-3" fieldsetClassName="space-y-3">
    <Fields projectId={project.projectId} orderId={orderId} milestone={milestone}/>
    {!milestone && payments.length ? <FormField label={t("copyPayment")}><Select value="" onValueChange={id => { const payment = payments.find(item => item.id === id); if (payment) { setTitle(payment.description ?? ""); setMode("net"); setValue(payment.net_amount ?? ""); } }}><SelectItem value="">{t("copyHelp")}</SelectItem>{payments.map(payment => <SelectItem key={payment.id} value={payment.id ?? ""}>{payment.description}</SelectItem>)}</Select></FormField> : null}
    <FormField label={t("deliverable")}><Input name="title" value={title} onChange={event => setTitle(event.target.value)} maxLength={2000} required/></FormField>
    <div className="grid gap-3 sm:grid-cols-2"><FormField label={t("stage")}><input type="hidden" name="stage" value={stage}/><Select value={stage} onValueChange={setStage}><SelectItem value="">{t("customDeliverable")}</SelectItem>{project.earningStages.filter(item => item.is_enabled && item.direction_id && directionIds.has(item.direction_id)).map(item => <SelectItem key={item.stage} value={item.stage}>{project.directions.length > 1 ? `${project.directions.find(direction => direction.id === item.direction_id)?.name ?? t("mainDirection")} · ` : ""}{item.display_name ?? getStageLabel(item.stage, stageT)}</SelectItem>)}</Select></FormField>
      <FormField label={t("condition")}><input type="hidden" name="condition" value={condition}/><Select value={condition} onValueChange={next => { if (next === "delivery" || next === "acceptance") setCondition(next); }}><SelectItem value="delivery">{t("onDelivery")}</SelectItem><SelectItem value="acceptance">{t("onAcceptance")}</SelectItem></Select></FormField></div>
    <div className="grid grid-cols-2 gap-3"><FormField label={t("allocation")}><Select value={mode} onValueChange={next => { setMode(next); setValue(""); }}><SelectItem value="net">{t("netAmount")}</SelectItem><SelectItem value="share">{t("share")}</SelectItem></Select></FormField><FormField label={mode === "share" ? t("share") : t("netAmount")}><Input name={mode === "share" ? "percentage" : "netAmount"} value={value} onChange={event => setValue(event.target.value)} inputMode="decimal" required/></FormField></div>
  </FinanceActionForm>;
}

function FulfillmentForm({ milestone, currency, onSaved, onPending }: { milestone: Milestone; currency: FinanceCurrency; onSaved: () => void; onPending: (pending: boolean) => void }) {
  const t = useTranslations("Finance.earnings"), locale = useLocale();
  const [kind, setKind] = useState(milestone.events.some(event => event.kind === "delivery") ? "acceptance" : "delivery");
  const [date, setDate] = useState("");
  return <AnimatedDisclosure title={t("confirmEvent")}><FinanceActionForm action={fulfillEarningMilestone} onSaved={onSaved} onPending={onPending} label={t(kind)} className="space-y-3 pt-3" fieldsetClassName="space-y-3">
    <input type="hidden" name="intent" value="fulfill"/><input type="hidden" name="milestoneId" value={milestone.id}/><input type="hidden" name="revision" value={milestone.revision}/><input type="hidden" name="kind" value={kind}/>
    {milestone.condition === "acceptance" && !milestone.events.length ? <FormField label={t("event")}><Select value={kind} onValueChange={setKind}><SelectItem value="delivery">{t("delivery")}</SelectItem><SelectItem value="acceptance">{t("acceptance")}</SelectItem></Select></FormField> : null}
    <FormField label={t("actualDate")}><DatePicker name="date" value={date} onValueChange={setDate} locale={locale} required/></FormField>
    <p className="text-xs leading-5 text-[var(--ui-text-secondary)]">{kind === milestone.condition ? t("preview", { amount: formatFinanceAmount(milestone.net_amount, currency, locale) }) : t("awaitingAcceptance")}</p>
    <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" name="confirmed" value="true" required className="mt-1"/>{t("confirmFact")}</label>
  </FinanceActionForm></AnimatedDisclosure>;
}
