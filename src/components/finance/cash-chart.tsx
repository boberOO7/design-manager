"use client";
import { useEffect, useRef, useState } from "react";
import { formatFinanceAmount, canChartFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { useLocale, useTranslations } from "next-intl";
import { financeCashChartPoints, type FinanceOverview } from "@/lib/finance-overview";

// Number conversion is only for SVG coordinates; all money and cumulative sums come from SQL.
export function FinanceCashChart({ data, currency, through = data.forecast.through, compact = false }: { data: FinanceOverview; currency: FinanceCurrency; through?: string; compact?: boolean }) {
  const t = useTranslations("Finance.overview");
  const locale = useLocale();
  const report = data.forecast;
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const points = financeCashChartPoints(data, through);
  const format = (value: string) => formatFinanceAmount(value, currency, locale);
  const chartSafe = points.every(p => p.amount === null || canChartFinanceAmount(p.amount, currency.minor_units));
  const values = points.flatMap(p => p.amount === null ? [] : [Number(p.amount)]);
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const start = Date.parse(data.actualFrom), end = Date.parse(through);
  const plotLeft = 80, plotRight = 24, plotTop = 30, plotBottom = compact ? 166 : 246;
  const x = (date: string) => plotLeft + (Date.parse(date) - start) / Math.max(end - start, 1) * (width - plotLeft - plotRight);
  const y = (amount: string | number) => plotBottom - (Number(amount) - min) / (max - min) * (plotBottom - plotTop);
  const path = (kind: "actual" | "forecast") => points.filter(p => p.kind === kind && p.amount !== null).map((p, i) => `${i ? "H" : "M"}${x(p.date)}${i ? "V" : ","}${y(p.amount ?? "0")}`).join(" ");
  const forecastPoints = points.filter(p => p.kind === "forecast" && p.amount !== null);
  const forecastArea = forecastPoints.length ? `M${x(forecastPoints[0].date)},${plotBottom} L${x(forecastPoints[0].date)},${y(forecastPoints[0].amount ?? "0")}${forecastPoints.slice(1).map(p => ` H${x(p.date)} V${y(p.amount ?? "0")}`).join("")} L${x(forecastPoints.at(-1)?.date ?? through)},${plotBottom} Z` : "";
  const active = selected === null ? null : points[selected] ?? null;
  const projectedMinimumIndex = points.findIndex(p => p.kind === "forecast" && p.date === data.lowPoint.date && p.amount === data.lowPoint.amount);
  const activePoint = active && active.amount !== null ? { ...active, amount: active.amount } : null;
  const incomplete = report.cashIncomplete || report.issues.length > 0;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--ui-text-secondary)]"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-[var(--ui-text-secondary)]" />{t("actual")}{data.historyIncomplete ? ` · ${t("unavailable")}` : ""}</span><span className="inline-flex items-center gap-2 text-[var(--ui-success-text)]"><span aria-hidden="true" className="w-5 border-t-2 border-dashed border-[var(--ui-success-accent)]" />{t("forecast")}{incomplete ? ` · ${t("incomplete")}` : ""}</span><span className="font-medium tabular-nums text-[var(--ui-text-muted)]">{report.currency}</span></div>
    <div ref={container} className="relative">
      {chartSafe ? <svg viewBox={`0 0 ${width} ${plotBottom + 44}`} className="block w-full" role="group" aria-label={t("cashChart")} aria-describedby="cash-chart-description">
        <desc id="cash-chart-description">{t("chartDescription")}</desc>
        {[min, (min + max) / 2, max].map((value, i) => <g key={i}><line x1={plotLeft} x2={width - plotRight} y1={y(value)} y2={y(value)} stroke="var(--ui-border)" strokeOpacity="0.78" strokeDasharray={i === 1 ? "3 5" : undefined} /><text x={plotLeft - 12} y={y(value) + 4} textAnchor="end" fontSize="11" fontWeight="500" fill="var(--ui-text-muted)">{new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text></g>)}
        <path d={forecastArea} fill="var(--ui-success-accent)" fillOpacity="0.07" />
        <line x1={x(report.asOf)} x2={x(report.asOf)} y1={plotTop} y2={plotBottom} stroke="var(--ui-border-strong)" strokeWidth="1.5" strokeDasharray="4 5" />
        <text x={x(report.asOf)} y="16" textAnchor={x(report.asOf) < 145 ? "start" : "middle"} fill="var(--ui-text-muted)" fontSize="11" fontWeight="600">{t("today")} · {report.asOf}</text>
        <path d={path("actual")} fill="none" stroke="var(--ui-text-secondary)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path("forecast")} fill="none" stroke="var(--ui-success-accent)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="9 6" />
        {[data.actualFrom, through].map((date, i) => <text key={i} x={x(date)} y={plotBottom + 29} textAnchor={i === 0 ? "start" : "end"} fontSize="11" fontWeight="500" fill="var(--ui-text-muted)">{date}</text>)}
        {projectedMinimumIndex >= 0 ? <circle aria-hidden="true" cx={x(points[projectedMinimumIndex].date)} cy={y(points[projectedMinimumIndex].amount ?? "0")} r="5" fill="var(--ui-surface)" stroke="var(--ui-success-accent)" strokeWidth="2.5" /> : null}
        {activePoint ? <g aria-hidden="true"><line x1={x(activePoint.date)} x2={x(activePoint.date)} y1={plotTop} y2={plotBottom} stroke="var(--ui-focus)" strokeOpacity="0.7" strokeDasharray="3 4" /><line x1={plotLeft} x2={width - plotRight} y1={y(activePoint.amount)} y2={y(activePoint.amount)} stroke="var(--ui-focus)" strokeOpacity="0.45" strokeDasharray="3 4" /><circle cx={x(activePoint.date)} cy={y(activePoint.amount)} r="5" fill="var(--ui-surface)" stroke={activePoint.kind === "actual" ? "var(--ui-text-secondary)" : "var(--ui-success-accent)"} strokeWidth="2.5" className="transition-[r,opacity] duration-[180ms] ease-out motion-reduce:transition-none" /></g> : null}
        {points.map((p, i) => p.amount === null ? null : <circle key={i} cx={x(p.date)} cy={y(p.amount)} r="10" fill="transparent" stroke="transparent" tabIndex={i === (selected ?? points.findIndex(point => point.amount !== null)) ? 0 : -1} role="button" aria-label={`${t(p.kind)} · ${p.date} · ${format(p.amount)}${p.kind === "forecast" && incomplete ? ` · ${t("incomplete")}` : ""}`} onFocus={() => setSelected(i)} onMouseEnter={() => setSelected(i)} onClick={() => setSelected(i)} onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          let next = i + direction;
          while (points[next]?.amount === null) next += direction;
          const target = event.currentTarget.parentElement?.querySelectorAll<SVGCircleElement>('circle[role="button"]');
          const visibleIndex = points.slice(0, next).filter(point => point.amount !== null).length;
          if (points[next]) target?.[visibleIndex]?.focus();
        }}><title>{`${p.date}: ${format(p.amount)}`}</title></circle>)}
      </svg> : <p className="text-sm text-[var(--ui-text-secondary)]">{t("chartScale")}</p>}
      {activePoint ? <div aria-hidden="true" className="pointer-events-none absolute z-10 max-w-[min(18rem,calc(100%-1rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2.5 py-2 text-xs shadow-[var(--ui-shadow-popover)]" style={{ left: `${Math.min(94, Math.max(7, x(activePoint.date) / width * 100))}%`, top: `${Math.max(8, y(activePoint.amount) / (plotBottom + 44) * 100)}%`, transform: x(activePoint.date) / width > 0.7 ? "translate(-100%, -110%)" : "translate(12px, -110%)" }}><span className="block font-medium text-[var(--ui-text-secondary)]">{t(activePoint.kind)} · {activePoint.date}</span><span className="mt-0.5 block font-semibold tabular-nums text-[var(--ui-text)]">{format(activePoint.amount)}</span></div> : null}
    </div>
    {chartSafe ? <p className={activePoint ? "sr-only" : "min-h-5 text-sm text-[var(--ui-text-secondary)]"} aria-live="polite">{activePoint ? `${t(activePoint.kind)} · ${activePoint.date} · ${format(activePoint.amount)}` : t("chartInteraction")}</p> : null}
    <details className="text-sm" open={chartSafe ? undefined : true}><summary className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--ui-radius-control)] font-medium focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{t("chartData")}</summary><div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left [&_th]:p-2 [&_td]:p-2"><caption className="sr-only">{t("cashChart")}</caption><thead><tr><th scope="col">{t("date")}</th><th scope="col">{t("series")}</th><th scope="col">{report.currency}</th></tr></thead><tbody>{points.map((p, i) => <tr key={i}><th scope="row">{p.date}</th><td>{t(p.kind)}{p.kind === "forecast" && incomplete ? ` · ${t("incomplete")}` : ""}</td><td>{p.amount === null ? t("unavailable") : format(p.amount)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
