"use client";
import { useEffect, useRef, useState } from "react";
import { formatFinanceAmount, canChartFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import { useLocale, useTranslations } from "next-intl";
import type { FinanceOverview } from "@/lib/finance-overview";

// Number conversion is only for SVG coordinates; all money and cumulative sums come from SQL.
export function FinanceCashChart({ data, currency }: { data: FinanceOverview; currency: FinanceCurrency }) {
  const t = useTranslations("Finance.overview");
  const locale = useLocale();
  const report = data.forecast;
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.min(960, entry.contentRect.width))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const points = [
    ...data.history.map(p => ({ ...p, kind: "actual" as const })),
    { date: report.asOf, amount: report.cashBase, kind: "forecast" as const },
    ...data.projection.map(p => ({ ...p, kind: "forecast" as const })),
  ];
  const format = (value: string) => formatFinanceAmount(value, currency, locale);
  const chartSafe = points.every(p => p.amount === null || canChartFinanceAmount(p.amount, currency.minor_units));
  const values = points.flatMap(p => p.amount === null ? [] : [Number(p.amount)]);
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const start = Date.parse(data.actualFrom), end = Date.parse(report.through);
  const x = (date: string) => 76 + (Date.parse(date) - start) / Math.max(end - start, 1) * (width - 96);
  const y = (amount: string | number) => 240 - (Number(amount) - min) / (max - min) * 208;
  const path = (kind: "actual" | "forecast") => points.filter(p => p.kind === kind && p.amount !== null).map((p, i) => `${i ? "H" : "M"}${x(p.date)}${i ? "V" : ","}${y(p.amount ?? "0")}`).join(" ");
  const active = selected === null ? null : points[selected];
  const incomplete = report.cashIncomplete || report.issues.length > 0;
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--ui-text-secondary)]"><span>━━ {t("actual")}{data.historyIncomplete ? ` · ${t("unavailable")}` : ""}</span><span className="text-[var(--ui-success-text)]">┄┄ {t("forecast")}{incomplete ? ` · ${t("incomplete")}` : ""}</span><span>{report.currency}</span></div>
    <div ref={container}>
      {chartSafe ? <svg viewBox={`0 0 ${width} 280`} className="w-full" role="group" aria-label={t("cashChart")} aria-describedby="cash-chart-description">
        <desc id="cash-chart-description">{t("chartDescription")}</desc>
        {[min, (min + max) / 2, max].map((value, i) => <g key={i}><line x1="76" x2={width - 20} y1={y(value)} y2={y(value)} stroke="var(--ui-border)" /><text x="66" y={y(value) + 4} textAnchor="end" fontSize="12" fill="var(--ui-text-secondary)">{new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text></g>)}
        <line x1={x(report.asOf)} x2={x(report.asOf)} y1="20" y2="240" stroke="var(--ui-text-muted)" strokeDasharray="3 4" />
        <text x={x(report.asOf)} y="12" textAnchor={x(report.asOf) < 130 ? "start" : "middle"} fill="var(--ui-text-secondary)" fontSize="12">{t("today")} · {report.asOf}</text>
        <path d={path("actual")} fill="none" stroke="var(--ui-text)" strokeWidth="2.5" />
        <path d={path("forecast")} fill="none" stroke="var(--ui-success-accent)" strokeWidth="2.5" strokeDasharray="7 5" />
        {[data.actualFrom, report.through].map((date, i) => <text key={i} x={x(date)} y="267" textAnchor={i === 0 ? "start" : "end"} fontSize="12" fill="var(--ui-text-secondary)">{date}</text>)}
        {points.map((p, i) => p.amount === null ? null : <circle key={i} cx={x(p.date)} cy={y(p.amount)} r={selected === i ? 5 : 3} fill={p.kind === "actual" ? "var(--ui-text)" : "var(--ui-success-accent)"} stroke="transparent" strokeWidth="18" tabIndex={i === (selected ?? points.findIndex(point => point.amount !== null)) ? 0 : -1} role="button" aria-label={`${t(p.kind)} · ${p.date} · ${format(p.amount)}${p.kind === "forecast" && incomplete ? ` · ${t("incomplete")}` : ""}`} onFocus={() => setSelected(i)} onMouseEnter={() => setSelected(i)} onClick={() => setSelected(i)} onKeyDown={event => {
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
    </div>
    {chartSafe ? <p className="min-h-5 text-sm tabular-nums" aria-live="polite">{active?.amount !== null && active ? `${t(active.kind)} · ${active.date} · ${format(active.amount)}` : t("chartInteraction")}</p> : null}
    <details className="text-sm" open={chartSafe ? undefined : true}><summary className="cursor-pointer font-medium">{t("chartData")}</summary><div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left [&_th]:p-2 [&_td]:p-2"><caption className="sr-only">{t("cashChart")}</caption><thead><tr><th scope="col">{t("date")}</th><th scope="col">{t("series")}</th><th scope="col">{report.currency}</th></tr></thead><tbody>{points.map((p, i) => <tr key={i}><th scope="row">{p.date}</th><td>{t(p.kind)}{p.kind === "forecast" && incomplete ? ` · ${t("incomplete")}` : ""}</td><td>{p.amount === null ? t("unavailable") : format(p.amount)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
