import type { ReactNode } from "react";
import { Panel } from "@/components/ui/panel";
import { Tooltip } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import type { DashboardMetric } from "@/lib/dashboard-presentation";
import { useLocale, useTranslations } from "next-intl";

const metricToneClasses = {
  neutral: "text-[var(--ui-text)]",
  warning: "text-[var(--ui-warning-text)]",
  danger: "text-[var(--ui-danger-text)]",
} as const;

export function MetricStrip({ metrics }: { metrics: DashboardMetric[] }) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  return <Panel className={metrics.length === 5 ? "flex flex-wrap overflow-hidden" : "grid grid-cols-2 overflow-hidden md:grid-cols-3 xl:grid-cols-6"}>
    {metrics.map((metric) => <div key={metric.labelKey} className={cn("flex min-w-0 flex-col border-b border-r border-[var(--ui-border)] px-4 py-3.5 last:border-r-0 xl:border-b-0", metrics.length === 5 && "basis-1/2 grow md:basis-1/3 xl:basis-1/5")}>
      <p className="text-xs font-medium leading-4 text-[var(--ui-text-muted)]">{t(metric.labelKey)}</p>
      <p className={cn("ui-numeric mt-auto break-words pt-2 text-xl font-semibold tracking-tight", metricToneClasses[metric.tone])}>{typeof metric.value === "number" ? formatNumber(metric.value, locale) : metric.value}</p>
    </div>)}
  </Panel>;
}

export function DashboardOverview({ metrics }: { metrics: DashboardMetric[] }) {
  const t = useTranslations("Dashboard");
  return <section className="dashboard-reveal space-y-3"><h1 className="text-2xl font-semibold tracking-tight text-[var(--ui-text)]">{t("title")}</h1><MetricStrip metrics={metrics} /></section>;
}

export function DashboardSection({ children, className, description, flushContent = false, title }: { children: ReactNode; className?: string; description?: string; flushContent?: boolean; title: string }) {
  const t = useTranslations("Dashboard");
  return <section className={cn("min-w-0", className)}>
    <OperationalSurface className={cn("p-4", flushContent && "pb-0")}>
      <div className="mb-2 flex items-center gap-1.5">
        <h2 className="min-w-0 text-sm font-semibold leading-6 tracking-wide text-[var(--ui-text-secondary)]">{title}</h2>
        {description ? <Tooltip content={description} openOnClick>
          <button type="button" aria-label={t("sectionHelp", { section: title })} className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </Tooltip> : null}
      </div>
      {/* Rows supply their own horizontal padding; keep them aligned with the header. */}
      <div className={cn("-mx-3", flushContent && "-mx-4")}>{children}</div>
    </OperationalSurface>
  </section>;
}

export function OperationalSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <Panel className={cn("overflow-hidden", className)}>{children}</Panel>;
}
