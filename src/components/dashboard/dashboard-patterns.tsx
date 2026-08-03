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
  return <Panel className="grid grid-cols-2 divide-x-0 divide-y divide-[var(--ui-border)] overflow-hidden sm:grid-cols-4 sm:divide-x sm:divide-y-0">
    {metrics.map((metric) => <div key={metric.labelKey} className="min-w-0 px-4 py-3 sm:px-5">
      <p className="text-xs font-medium text-[var(--ui-text-muted)]">{t(metric.labelKey)}</p>
      <p className={cn("ui-numeric mt-1 text-2xl font-semibold tracking-tight", metricToneClasses[metric.tone])}>{formatNumber(metric.value, locale)}</p>
      <p className="mt-0.5 text-xs leading-5 text-[var(--ui-text-muted)]">{t(metric.descriptionKey)}</p>
    </div>)}
  </Panel>;
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
