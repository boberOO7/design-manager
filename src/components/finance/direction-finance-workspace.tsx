"use client";

import { ProjectWorkspaceLink as Link, useProjectWorkspaceNavigation } from "@/components/projects/project-workspace-navigation";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, ChevronRight, Link2, Plus } from "lucide-react";
import { saveOrderDirections } from "@/app/(app)/projects/[projectId]/direction-actions";
import type { FinanceProjectData, getFinanceData } from "@/data/queries/finance";
import { parseProjectOrderDraft } from "@/lib/finance-project-orders";
import { formatProjectFinanceMoney, type ProjectFinanceDisplay } from "@/lib/finance-project-view";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ProjectOrdersManager } from "./project-orders-manager";

type Foundation = NonNullable<Awaited<ReturnType<typeof getFinanceData>>>;
export function DirectionFinanceWorkspace({ project, directionId, currencies, reportingCurrency, display, projectHref }: {
  project: FinanceProjectData; directionId: string; currencies: Foundation["currencies"]; reportingCurrency: string;
  display?: ProjectFinanceDisplay; projectHref: string;
}) {
  const t = useTranslations("Finance"), locale = useLocale();
  const [manager, setManager] = useState<string | null>(null), [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null), [pending, startTransition] = useTransition();
  const navigation = useProjectWorkspaceNavigation();
  const linkedIds = new Set(project.directionLinks.filter(link => link.direction_id === directionId).map(link => link.order_id));
  const linked = project.orders.filter(order => linkedIds.has(order.id));
  const available = project.orders.filter(order => !linkedIds.has(order.id) && order.status !== "discarded");
  function attach(orderId: string) {
    setError(null);
    const directionIds = [...new Set([...project.directionLinks.filter(link => link.order_id === orderId).map(link => link.direction_id), directionId])];
    startTransition(async () => {
      const result = await saveOrderDirections(project.projectId, orderId, directionIds, project.directionVersion).catch(() => ({ success: false, error: "failed" } as const));
      if (!result.success) { setError(t(result.error === "conflict" ? "orders.directionsConflict" : result.error === "milestones" ? "orders.directionsMilestones" : "orders.directionsFailed")); return; }
      setAttaching(false); navigation?.refresh();
    });
  }
  return <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5" data-direction-finance={directionId}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold">{t("directionWorkspace.title")}</h2>
      <Link href={projectHref} prefetch={false} scroll={false} className="inline-flex min-h-10 items-center gap-1 rounded-[var(--ui-radius-control)] text-xs font-medium text-[var(--ui-text-secondary)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("directionWorkspace.allFinance")}<ArrowUpRight aria-hidden="true" className="size-3.5"/></Link>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
      <Button type="button" size="compact" className="min-h-10 gap-1.5" onClick={() => setManager("new")}><Plus aria-hidden="true" className="size-3.5"/>{t("directionWorkspace.create")}</Button>
      {available.length ? <Button type="button" size="compact" variant="outline" className="min-h-10 gap-1.5" onClick={() => setAttaching(true)}><Link2 aria-hidden="true" className="size-3.5"/>{t("directionWorkspace.attach")}</Button> : null}
    </div>
    {linked.length ? <div className="mt-4 divide-y divide-[var(--ui-border)]">{linked.map(order => {
      const term = project.terms.find(term => term.order_id === order.id && term.stream === "design");
      const draft = parseProjectOrderDraft(order.draft_plan, project.projectId, order.id);
      const totals = project.orderTotals.find(total => total.order_id === order.id);
      const currency = currencies.find(currency => currency.code === (term?.currency ?? draft?.currency));
      const otherDirections = project.directionLinks.filter(link => link.order_id === order.id && link.direction_id !== directionId).flatMap(link => project.directions.find(direction => direction.id === link.direction_id) ?? []);
      const money = (value: string | number | null | undefined) => formatProjectFinanceMoney(value, currency, display, locale);
      return <button key={order.id} type="button" onClick={() => setManager(order.id)} className="group flex min-h-20 w-full items-center gap-3 rounded-[var(--ui-radius-control)] py-3 text-left transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none" data-finance-order={order.id}>
        <div className="min-w-0 flex-1 px-1"><p className="break-words text-sm font-semibold">{order.name}</p><p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t(`orders.status.${order.status}`)}</p>{otherDirections.length ? <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("directionWorkspace.shared", { names: otherDirections.map(direction => direction.name ?? t(direction.kind ? `directionWorkspace.kinds.${direction.kind}` : "orders.defaultDirectionName")).join(", ") })}</p> : null}</div>
        <div className="ui-numeric text-right"><p className="text-xs text-[var(--ui-text-muted)]">{t("directionWorkspace.orderTotal")}</p><p className="mt-1 text-sm font-semibold">{money(term?.gross_amount ?? totals?.contract_gross_amount)}</p>{totals ? <p className="mt-1 text-xs text-[var(--ui-text-secondary)]">{t("project.collected")} {money(totals.collected_amount)}</p> : null}</div>
        <ChevronRight aria-hidden="true" className="mr-1 size-4 shrink-0 text-[var(--ui-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"/>
      </button>;
    })}</div> : <p className="py-6 text-sm text-[var(--ui-text-muted)]">{t("directionWorkspace.empty")}</p>}
    {linked.some(order => project.directionLinks.filter(link => link.order_id === order.id).length > 1) ? <p className="mt-3 border-t border-[var(--ui-border)] pt-3 text-xs leading-5 text-[var(--ui-text-muted)]">{t("directionWorkspace.sharedHelp")}</p> : null}
    {manager !== null ? <ProjectOrdersManager project={project} currencies={currencies} reportingCurrency={reportingCurrency} display={display} initialOrderId={manager === "new" ? undefined : manager} initiallyAdding={manager === "new"} scopeDirectionId={directionId} onClose={() => setManager(null)}/> : null}
    {attaching ? <Dialog isOpen title={t("directionWorkspace.attach")} closeLabel={t("movements.close")} closeDisabled={pending} onRequestClose={() => setAttaching(false)} className="h-auto max-h-[calc(100dvh-1rem)] max-w-md"><div className="min-h-0 overflow-y-auto p-3">{available.map(order => <button key={order.id} type="button" disabled={pending} onClick={() => attach(order.id)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--ui-radius-control)] px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="min-w-0 break-words">{order.name}</span><Plus aria-hidden="true" className="size-4 shrink-0"/></button>)}{error ? <p role="alert" className="p-3 text-xs text-[var(--ui-danger-text)]">{error}</p> : null}</div></Dialog> : null}
  </section>;
}
