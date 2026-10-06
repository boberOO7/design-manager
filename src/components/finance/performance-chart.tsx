"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { canChartFinanceAmount, formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import type { FinanceAnalytics } from "@/lib/finance-analytics";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";

const series = ["revenue", "costs", "result"] as const;
const colors = { revenue: "var(--ui-success-accent)", costs: "var(--ui-text-muted)", result: "var(--ui-text)" };
export function FinancePerformanceChart({ months, currency }: { months: FinanceAnalytics["months"]; currency: FinanceCurrency }) {
  const t = useTranslations("Finance.overview.analytics"), locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720), [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  const money = (value: string | null) => value === null ? "—" : formatFinanceAmount(value, currency, locale, "decimal");
  const monthLabel = (date: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const safe = months.every(m => series.every(key => m[key].amount === null || canChartFinanceAmount(m[key].amount, currency.minor_units)));
  const values = months.flatMap(m => series.flatMap(key => m[key].amount === null ? [] : [Number(m[key].amount)]));
  const low = Math.min(0, ...values), high = Math.max(1, ...values), top = 16, bottom = width < 500 ? 220 : 260, left = 54, right = 12;
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const step = (width - left - right) / Math.max(1, months.length), x = (i: number) => left + step * (i + 0.5);
  const labelInterval = Math.max(1, Math.ceil(months.length / (width < 500 ? 4 : 8)));
  const currentMonthIndex = months.findIndex(m => m.current);
  const bar = Math.min(28, step * 0.22);
  const path = months.map((m, i) => m.result.amount === null ? "" : `${i > 0 && months[i - 1].result.amount !== null ? "L" : "M"}${x(i)},${y(Number(m.result.amount))}`).join(" ");
  const active = selected === null ? null : months[selected];
  const hasActivity = months.some(m => m.hasEntries);
  const hasData = values.some(v => v !== 0) || (hasActivity && months.some(m => m.hasEntries && !m.incomplete));
  return <div ref={ref} className="min-w-0 space-y-3">
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--ui-text-secondary)]">{series.map(key => <span key={key} className="inline-flex items-center gap-2"><span aria-hidden="true" className={key === "result" ? "w-5 border-t-2" : "h-2.5 w-2.5 rounded-sm"} style={key === "result" ? { borderColor: colors[key] } : { background: colors[key] }}/>{t(key)}</span>)}<span>{currency.code}</span></div>
    {!hasData ? <div className="flex min-h-44 items-center justify-center text-center text-sm text-[var(--ui-text-secondary)]">{t(hasActivity ? "unvaluedPerformance" : "emptyPerformance")}</div> : safe ? <svg role="group" aria-label={t("trend")} viewBox={`0 0 ${width} ${bottom + 40}`} className="block w-full">
      {[low, (low + high) / 2, high].map((value, i) => <g key={i}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--ui-border-subtle)"/><text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize="11" fill="var(--ui-text-muted)">{new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text></g>)}
      <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} stroke="var(--ui-border-strong)"/>
      {months.map((m, i) => <g key={m.month}>
        {(["revenue", "costs"] as const).map((key, s) => m[key].amount === null ? null : <rect key={key} x={x(i) + (s === 0 ? -bar - 2 : 2)} y={Math.min(y(0), y(Number(m[key].amount)))} width={bar} height={Math.max(0, Math.abs(y(Number(m[key].amount)) - y(0)))} rx="2" fill={colors[key]} fillOpacity={m[key].incomplete ? 0.45 : 0.85} stroke={m[key].incomplete ? colors[key] : undefined} strokeDasharray={m[key].incomplete ? "3 3" : undefined}/>)}
        {m.current || (i % labelInterval === 0 && (currentMonthIndex < 0 || Math.abs(currentMonthIndex - i) >= labelInterval)) ? <text x={x(i)} y={bottom + 24} textAnchor={i === months.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--ui-text-secondary)">{monthLabel(m.month)}{m.current ? "*" : ""}</text> : null}
      </g>)}
      <path d={path} fill="none" stroke={colors.result} strokeWidth="2"/>
      {months.map((m, i) => <g key={m.month}>{m.result.amount !== null ? <circle cx={x(i)} cy={y(Number(m.result.amount))} r="4" fill={m.result.incomplete ? "var(--ui-surface)" : colors.result} stroke={colors.result} strokeWidth="1.5"/> : null}
        <rect x={left + step * i} y={top} width={step} height={bottom - top} fill="transparent" role="button" tabIndex={i === (selected ?? 0) ? 0 : -1} aria-label={`${monthLabel(m.month)}: ${series.map(key => `${t(key)} ${money(m[key].amount)}${m[key].incomplete ? ` (${t("partial")})` : ""}`).join(", ")}`} onFocus={() => setSelected(i)} onMouseEnter={() => setSelected(i)} onClick={() => setSelected(i)} onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault(); const next = i + (event.key === "ArrowRight" ? 1 : -1);
          if (months[next]) event.currentTarget.ownerSVGElement?.querySelectorAll<SVGRectElement>('rect[role="button"]')[next]?.focus();
        }} stroke={selected === i ? "var(--ui-focus)" : "transparent"} strokeDasharray="3 4"/>
      </g>)}
    </svg> : <p className="py-6 text-sm text-[var(--ui-text-secondary)]">{t("chartScale")}</p>}
    {hasData ? <p className="min-h-10 text-xs leading-relaxed text-[var(--ui-text-secondary)]" aria-live="polite">{active ? `${monthLabel(active.month)} — ${series.map(key => `${t(key)}: ${money(active[key].amount)}${active[key].incomplete ? ` (${t("partial")})` : ""}`).join("; ")}` : t("chartHint")}</p> : null}
    <AnimatedDisclosure title={t("chartData")} defaultOpen={!safe}><table className="w-full text-left text-xs [&_td]:py-2 [&_th]:py-2"><caption className="sr-only">{t("trend")}</caption><thead><tr><th scope="col">{t("month")}</th>{series.map(key => <th scope="col" key={key} className="text-right">{t(key)}</th>)}</tr></thead><tbody>{months.map(m => <tr key={m.month} className="border-t border-[var(--ui-border-subtle)]"><th scope="row" className="font-normal">{monthLabel(m.month)}{m.current ? "*" : ""}</th>{series.map(key => <td key={key} className="text-right tabular-nums">{money(m[key].amount)}{m[key].incomplete ? <span className="block text-[var(--ui-warning-text)]">{t("partial")}</span> : null}</td>)}</tr>)}</tbody></table></AnimatedDisclosure>
  </div>;
}
