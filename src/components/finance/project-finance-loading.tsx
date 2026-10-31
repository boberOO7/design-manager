import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ProjectFinanceTab } from "@/lib/finance-project-view";
import type { FinanceProjectData } from "@/data/queries/finance";
import { projectFinanceMetricClass, projectFinanceSummaryClass, projectPaymentGridClass } from "./project-finance-layout";

function Ink({ className }: { className: string }) {
  return <span aria-hidden="true" className={`instaload-mark max-w-full ${className}`} />;
}

function Loading({ children }: { children: ReactNode }) {
  const t = useTranslations("Common");
  return <div data-project-loading="finance" className="instaload-blueprint min-w-0"><span role="status" className="sr-only">{t("loading")}</span><div className="space-y-4">{children}</div></div>;
}

function PaymentRows({ count = 3 }: { count?: number }) {
  return <div className="space-y-1.5">{Array.from({ length: count }, (_, index) => <div key={index} className="@container rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface)]">
    <div className={projectPaymentGridClass}>
      <div className="min-w-0"><Ink className="h-5 w-80"/><Ink className="mt-1 h-4 w-40"/></div>
      <div className="col-span-2 col-start-1 row-start-2 @min-[64rem]:col-span-1 @min-[64rem]:col-start-2 @min-[64rem]:row-start-1"><Ink className="h-6 w-32"/></div>
      <div className="col-start-2 row-start-1 justify-self-end @min-[64rem]:col-start-5"><Ink className="h-6 w-28"/></div>
      <div className="col-span-2 col-start-1 row-start-3 flex min-h-11 items-center justify-between gap-2 @min-[64rem]:contents">
        <div className="@min-[64rem]:col-start-4 @min-[64rem]:row-start-1"><Ink className="h-4 w-32"/></div>
        <div className="flex min-h-11 w-[9.25rem] items-center justify-end @min-[64rem]:col-start-6 @min-[64rem]:row-start-1"><Ink className="size-5"/></div>
      </div>
    </div>
  </div>)}</div>;
}

export function projectFinanceLoadingRows(project: {
  orders: readonly Pick<FinanceProjectData["orders"][number], "id" | "status">[];
  orderTotals: readonly Pick<FinanceProjectData["orderTotals"][number], "order_id" | "payment_count">[];
}, page: number) {
  // Existing totals are layout hints, not another data source. Match planning's
  // 50-row page; filters/cancelled items can still change the final row count.
  let offset = 0;
  return project.orders.filter(order => order.status === "confirmed").flatMap(order => {
    const count = project.orderTotals.find(total => total.order_id === order.id)?.payment_count ?? 0;
    const visible = Math.max(0, Math.min(offset + count, page * 50) - Math.max(offset, (page - 1) * 50));
    offset += count;
    return visible ? [visible] : [];
  });
}

function Body({ tab, direction = false, project, page = 1, stream = "design" }: { tab: ProjectFinanceTab; direction?: boolean; project?: Pick<FinanceProjectData, "orders" | "orderTotals">; page?: number; stream?: string }) {
  if (direction && tab !== "payments") return <div className="space-y-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5"><Ink className="h-5 w-96"/><Ink className="h-11 w-52"/></div>;
  if (tab === "result") return <>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Ink className="h-7 w-56"/><Ink className="mt-1 h-5 w-96"/></div><Ink className="h-11 w-32"/></div>
    <div className="flex min-h-11 flex-wrap gap-2">{[0, 1, 2, 3].map(index => <Ink key={index} className="h-11 w-24"/>)}</div>
    <div className="space-y-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5"><Ink className="h-6 w-56"/><Ink className="h-4 w-96"/><div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map(index => <div key={index}><Ink className="h-4 w-40"/><Ink className="mt-1 h-5 w-28"/></div>)}</div></div>
    <div className="space-y-4 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5"><Ink className="h-5 w-40"/><Ink className="h-9 w-52"/><div className="grid gap-3 border-t border-[var(--ui-border-subtle)] pt-3 sm:grid-cols-2">{[0, 1].map(index => <div key={index}><Ink className="h-4 w-40"/><Ink className="mt-1 h-6 w-32"/></div>)}</div></div>
  </>;
  const groups = tab === "payments" && stream === "design" && project ? projectFinanceLoadingRows(project, page) : [3];
  return <>
    <div className="grid min-w-0 items-center gap-x-4 gap-y-1 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-wrap items-center gap-3"><Ink className={tab === "expenses" ? "h-6 w-44" : "h-6 w-28"}/>{!direction && tab === "payments" ? <Ink className="h-9 w-[17rem]"/> : null}</div>
      <div className="flex h-14 min-w-0 items-center justify-end gap-2 overflow-hidden p-1"><Ink className={tab === "expenses" ? "h-11 w-44" : "h-9 w-48"}/>{tab !== "expenses" ? <Ink className="h-9 w-36"/> : null}</div>
    </div>
    {tab === "payments" && stream === "design" && groups.length > 0 ? <div className="flex min-h-11 items-center rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-subtle)] px-4 py-3"><Ink className="h-5 w-72"/></div> : null}
    <div className="space-y-6">{groups.map((count, index) => <div key={index} className="space-y-2">
      {tab === "payments" && stream === "design" ? <div className="flex items-start justify-between gap-3 px-1"><div><Ink className="h-5 w-48"/><Ink className="mt-1 h-4 w-40"/></div><Ink className="h-8 w-16"/></div> : null}
      <PaymentRows count={count}/>
    </div>)}</div>
    {!groups.length ? <div className="py-4"><Ink className="h-5 w-64"/></div> : null}
  </>;
}

export function ProjectFinanceBodyBlueprint(props: Parameters<typeof Body>[0]) {
  return <Loading><Body {...props}/></Loading>;
}

export function ProjectFinanceBlueprint({ tab = "payments", direction = false, navigation, stream }: { tab?: ProjectFinanceTab; direction?: boolean; navigation?: ReactNode; stream?: string }) {
  return <Loading>
    {direction ? <div className="flex min-h-10 items-center justify-between gap-3"><Ink className="h-6 w-48"/><Ink className="h-4 w-36"/></div> : null}
    <section className={projectFinanceSummaryClass}>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        {[0, 1, 2].map(index => <div key={index} className={`${projectFinanceMetricClass} ${index === 0 ? "lg:grow-[1.15]" : ""}`}><Ink className="h-4 w-32"/><Ink className={`mt-1 w-40 ${index === 0 ? "h-8" : "h-7"}`}/></div>)}
        <div className="min-w-0 flex-1 basis-[calc(50%-0.625rem)] lg:min-w-40 lg:basis-0 lg:grow-[1.25]"><Ink className="h-4 w-32"/><Ink className="mt-1 h-7 w-36"/><Ink className="mt-1 h-4 w-80"/></div>
        <div className="flex w-full justify-end border-t border-[var(--ui-border-subtle)] pt-2 lg:ml-auto lg:w-auto lg:border-t-0 lg:pt-0"><Ink className="h-9 w-24"/></div>
      </div>
      <div className="mt-3 h-0.5 rounded-full bg-[var(--ui-border-subtle)]"/>
    </section>
    {navigation ?? <div className="flex gap-1 border-b border-[var(--ui-border)]">{[0, 1, 2].map(index => <div key={index} className="flex min-h-11 flex-1 items-center justify-center px-4 py-2 sm:flex-none"><Ink className="h-5 w-24"/></div>)}</div>}
    <Body tab={tab} direction={direction} stream={stream}/>
  </Loading>;
}
