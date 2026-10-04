import { StatisticsInfo } from "./statistics-info";

export const statisticsPanel = "min-w-0 overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]";
export const statisticsTable = "w-full text-left text-xs [&_td]:px-5 [&_td]:py-3 [&_th]:px-5 [&_th]:py-3 [&_thead_th]:font-medium";

export function StatisticsCardHeader({ title, titleId, info, infoLabel = title, children }: {
  title: string; titleId?: string; info: React.ReactNode; infoLabel?: string; children?: React.ReactNode;
}) {
  return <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ui-border)] px-5 py-3">
    <h2 id={titleId} className="flex min-w-0 items-center gap-1 text-base font-semibold leading-6 text-[var(--ui-text)]">
      <span className="min-w-0">{title}</span>
      <StatisticsInfo label={infoLabel}>{typeof info === "string" ? <p>{info}</p> : info}</StatisticsInfo>
    </h2>
    {children}
  </div>;
}

export function StatisticsMetric({ label, value, unit, hint, context, info, className = "" }: {
  label: string; value: string; unit?: string; hint?: string; context?: string; info?: React.ReactNode; className?: string;
}) {
  return <div className={`min-w-0 ${className}`}>
    {context ? <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{context}</p> : null}
    <p className={`flex items-center gap-1 leading-5 ${context ? "mt-2 min-h-9 text-sm font-medium text-[var(--ui-text)]" : "text-xs text-[var(--ui-text-secondary)]"}`}>
      {label}{info ? <StatisticsInfo label={label}>{info}</StatisticsInfo> : null}
    </p>
    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-semibold tabular-nums tracking-tight text-[var(--ui-text)]">
      <span className="text-3xl">{value}</span>{unit ? <span className="text-xs font-normal tracking-normal text-[var(--ui-text-muted)]">{unit}</span> : null}
    </p>
    {hint ? <p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{hint}</p> : null}
  </div>;
}
