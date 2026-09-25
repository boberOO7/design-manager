import type { ReactNode } from "react";
import { Panel } from "@/components/ui/panel";
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
  return <Panel className="grid grid-cols-2 overflow-hidden md:grid-cols-3 xl:grid-cols-6">
    {metrics.map((metric) => <div key={metric.labelKey} className="min-w-0 border-b border-r border-[var(--ui-border)] px-4 py-3.5 last:border-r-0 xl:last:border-b-0">
      <p className="text-xs font-medium leading-4 text-[var(--ui-text-muted)]">{t(metric.labelKey)}</p>
      <p className={cn("ui-numeric mt-2 break-words text-xl font-semibold tracking-tight", metricToneClasses[metric.tone])}>{typeof metric.value === "number" ? formatNumber(metric.value, locale) : metric.value}</p>
    </div>)}
  </Panel>;
}

export function DashboardOverview({ metrics }: { metrics: DashboardMetric[] }) {
  const t = useTranslations("Dashboard");
  return <section className="dashboard-reveal space-y-3"><h1 className="text-2xl font-semibold tracking-tight text-[var(--ui-text)]">{t("title")}</h1><MetricStrip metrics={metrics} /></section>;
}

export function DashboardSection({ children, className, description, title }: { children: ReactNode; className?: string; description?: string; title: string }) {
  return <section className={cn("min-w-0", className)}>
    <div className="mb-2.5">
      <h2 className="text-base font-semibold text-[var(--ui-text)]">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-[var(--ui-text-muted)]">{description}</p> : null}
    </div>
    {children}
  </section>;
}

export function OperationalSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <Panel className={cn("overflow-hidden", className)}>{children}</Panel>;
}
