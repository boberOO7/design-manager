"use client";

import Link from "next/link";
import { Suspense, use, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Banknote, Check, CircleAlert, ClipboardCheck, ClipboardClock, FolderKanban, ListChecks, PhoneCall, Wrench, type LucideIcon } from "lucide-react";
import type { DashboardFinance } from "@/data/queries/dashboard-operations";
import { selectAdminUpcoming, type AdminUpcomingItem } from "@/lib/dashboard";
import { financeOverdueDashboardHref, projectPaymentPresentation } from "@/lib/finance-planning";
import { formatCalendarDateTime } from "@/lib/calendar";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { BoundedDashboardList } from "./bounded-list";
import { BlueprintRows } from "./dashboard-blueprint";
import { DashboardReady } from "./dashboard-motion";

export type AttentionItem = { key: string; title: string; context: string; href: string; icon: "tasks" | "finance" | "crm" | "time-off" | "submissions" | "office" | "equipment" };

// Keep the ready rows mounted (including focus/scroll) when the Finance contribution streams in.
function FinanceContribution({ pending, onReady }: { pending: Promise<DashboardFinance>; onReady: (value: DashboardFinance) => void }) {
  const result = use(pending);
  useLayoutEffect(() => onReady(result), [result, onReady]);
  return null;
}

function useFinanceContribution() {
  const container = useRef<HTMLDivElement>(null);
  const received = useRef(false);
  const [ready, setReady] = useState<DashboardFinance | null>(null);
  const onReady = useCallback((result: DashboardFinance) => {
    if (!received.current) {
      const scope = container.current?.closest("[data-dashboard-ready]");
      scope?.dispatchEvent(new Event("dashboard-before-stream-update", { bubbles: true }));
      received.current = true;
    }
    setReady(result);
  }, []);
  return { container, ready, onReady };
}

export function AttentionFeed({ items: base, finance }: { items: AttentionItem[]; finance: Promise<DashboardFinance> }) {
  const t = useTranslations("Dashboard");
  const { container, ready, onReady } = useFinanceContribution();
  const icons: Record<AttentionItem["icon"], LucideIcon> = { tasks: CircleAlert, finance: Banknote, crm: PhoneCall, "time-off": ClipboardClock, submissions: ClipboardClock, office: ClipboardCheck, equipment: Wrench };
  const items: Array<AttentionItem | { key: string; pending: true }> = [...base];
  const payments: Array<AttentionItem | { key: string; pending: true }> = ready ? [
    ...(ready?.finance?.overdueReceivableCount ? [{ key: "receivables", title: t("attentionReceivables", { count: ready.finance.overdueReceivableCount }), context: t("domainFinance"), href: financeOverdueDashboardHref("incoming"), icon: "finance" as const }] : []),
    ...(ready?.finance?.overdueObligationCount ? [{ key: "obligations", title: t("attentionObligations", { count: ready.finance.overdueObligationCount }), context: t("domainFinance"), href: financeOverdueDashboardHref("outgoing"), icon: "finance" as const }] : []),
  ] : [{ key: "receivables", pending: true }, { key: "obligations", pending: true }];
  items.splice(items[0]?.key === "tasks" ? 1 : 0, 0, ...payments);
  const count = items.length;
  const grid = count <= 1 ? "grid" : count === 2 ? "grid sm:grid-cols-2" : "grid sm:grid-cols-2 xl:grid-cols-3";
  return <DashboardReady name="attention"><div ref={container} data-dashboard-finance={ready ? "ready" : "pending"}>
    <Suspense fallback={null}><FinanceContribution pending={finance} onReady={onReady} /></Suspense>
    {count ? <ul className={grid}>{items.map(item => {
      if ("pending" in item) return <li key={item.key}><BlueprintRows kind="attention" rows={1} /></li>;
      const Icon = icons[item.icon];
      return <li key={item.key} data-dashboard-arrival={`attention:${item.key}`}><Link href={item.href} className="group grid min-h-[5.25rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-3 transition-colors duration-[180ms] ease-out hover:bg-[var(--ui-surface-muted)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]">
        <span data-dashboard-icon className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)] shadow-sm"><Icon className="size-4" aria-hidden="true" /></span>
        <span className="min-w-0"><b className="block text-sm leading-5">{item.title}</b><small className="mt-0.5 block text-[var(--ui-text-muted)]">{item.context}</small></span>
        <ArrowUpRight className="size-4 shrink-0 text-[var(--ui-text-muted)] transition-colors duration-200 group-hover:text-[var(--ui-text)]" aria-hidden="true" />
      </Link></li>;
    })}</ul> : <div data-dashboard-arrival="attention:empty" className="flex min-h-[5.25rem] items-center gap-3 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-3 text-sm text-[var(--ui-text-secondary)]"><span data-dashboard-icon className="flex size-9 items-center justify-center rounded-full bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]"><Check className="size-4" aria-hidden="true" /></span>{t("emptyOperationalAttention")}</div>}
  </div></DashboardReady>;
}

export function UpcomingFeed({ items: base, today, finance }: { items: AdminUpcomingItem[]; today: string; finance: Promise<DashboardFinance> }) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const { container, ready, onReady } = useFinanceContribution();
  const payments = (ready?.finance?.upcoming ?? []).map((item): AdminUpcomingItem => {
    const paymentType = item.direction === "incoming" ? t("upcomingIncomingPayment") : t("upcomingOutgoingPayment");
    const project = item.projectName ? projectPaymentPresentation(item.description, item.projectName, paymentType, t("projectPayment")) : null;
    return { key: `finance:${item.id}`, kind: "finance", date: item.date, title: project?.title ?? (item.description || paymentType), context: project?.context ?? (item.obligationKind === "payroll" ? t("upcomingPayroll") : paymentType), href: `/finance/expected?item=${item.id}` };
  });
  const items = selectAdminUpcoming([...base, ...payments], today);
  return <DashboardReady name="upcoming"><div ref={container} data-dashboard-finance={ready ? "ready" : "pending"}>
    <Suspense fallback={null}><FinanceContribution pending={finance} onReady={onReady} /></Suspense>
    <BoundedDashboardList><ul className="space-y-1">{items.map(item => <UpcomingRow key={item.key} item={item} locale={locale} />)}
      {!ready ? <li key="finance-pending"><BlueprintRows rows={Math.max(1, 6 - items.length)} /></li> : null}
    </ul></BoundedDashboardList>
    {ready && !items.length ? <EmptyState compact className="border-0 bg-transparent" title={t("emptyUpcoming")} /> : null}
  </div></DashboardReady>;
}

function UpcomingRow({ item, locale }: { item: AdminUpcomingItem; locale: string }) {
  const iconByKind: Record<AdminUpcomingItem["kind"], LucideIcon> = { task: ListChecks, project: FolderKanban, finance: Banknote, crm: PhoneCall, assignment: ClipboardCheck, equipment: Wrench };
  const Icon = iconByKind[item.kind];
  const dateLabel = item.kind === "crm" ? formatCalendarDateTime(item.date, locale) : formatDate(item.date, locale);
  return <li data-dashboard-arrival={`upcoming:${item.key}`}><Link href={item.href} className="group grid min-h-[4.5rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[calc(var(--ui-radius-panel)-0.125rem)] px-3 py-2.5 transition-colors duration-[180ms] ease-out hover:bg-[var(--ui-surface-muted)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]">
    <span data-dashboard-icon className="flex size-8 items-center justify-center rounded-full bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"><Icon className="size-4" aria-hidden="true" /></span>
    <span className="min-w-0"><b className="block truncate text-sm">{item.title}</b>{item.context ? <small className="mt-0.5 block break-words text-[var(--ui-text-muted)]">{item.context}</small> : null}</span>
    <time dateTime={item.date} className="ui-numeric whitespace-nowrap text-right text-xs font-medium text-[var(--ui-text-secondary)]">{dateLabel}</time>
  </Link></li>;
}
