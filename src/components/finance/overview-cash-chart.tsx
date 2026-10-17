"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { canChartFinanceAmount, formatFinanceAmount, type FinanceCurrency } from "@/lib/finance";
import type { OverviewCashMonth } from "@/lib/finance-overview-dashboard";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";

export const cashInColor = "var(--ui-success-accent)";
export const cashOutColor = "light-dark(#d97732, #f0a365)";

export function OverviewCashChart({ points, currency }: { points: OverviewCashMonth[]; currency: FinanceCurrency }) {
  const t = useTranslations("Finance.overview.dashboard"), o = useTranslations("Finance.overview"), locale = useLocale();
  const container = useRef<HTMLDivElement>(null), id = useId();
  const [width, setWidth] = useState(0), [selected, setSelected] = useState<number | null>(null);
  const safe = points.every(point => [point.incoming, point.outgoing].every(amount => amount === null || canChartFinanceAmount(amount, currency.minor_units)));
  const recorded = points.some(point => point.recorded);
  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const measured = width > 0;
  useLayoutEffect(() => {
    if (measured) container.current?.querySelector("svg")?.dispatchEvent(new Event("statistics-chart-ready", { bubbles: true }));
  }, [measured]);
  const money = (amount: string | null) => amount === null ? "—" : formatFinanceAmount(amount, currency, locale, "decimal");
  const monthLabel = (month: string, full = false) => new Intl.DateTimeFormat(locale, { month: full ? "long" : "short", year: full ? "numeric" : "2-digit", timeZone: "UTC" }).format(new Date(month));
  const values = points.flatMap(point => [point.incoming, point.outgoing].flatMap(amount => amount === null ? [] : [Number(amount)]));
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const left = 56, right = 8, top = 24, bottom = 238, height = 276;
  const step = (width - left - right) / points.length;
  const tickEvery = Math.max(1, Math.ceil(points.length / (width < 480 ? 3 : width < 720 ? 6 : 12)));
  const x = (index: number) => left + step * (index + 0.5);
  const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const active = selected === null ? null : points[selected];
  const summary = (point: OverviewCashMonth) => `${monthLabel(point.month, true)} · ${t("received")}: ${money(point.incoming)} · ${t("spent")}: ${money(point.outgoing)} · ${t("net")}: ${money(point.net)} ${currency.code}`;
  return <div ref={container} className="min-w-0" data-testid="monthly-cash-chart">
    <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--ui-text-secondary)]">
      {([["received", cashInColor], ["spent", cashOutColor]] as const).map(([label, color]) => <span key={label} className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-sm" style={{ background: color }}/>{t(label)}</span>)}
      <span className="ml-auto text-[var(--ui-text-muted)]">{currency.code}</span>
    </div>
    {safe && recorded ? <div className="relative" onMouseLeave={() => setSelected(null)}>
      <svg height={height} viewBox={measured ? `0 0 ${width} ${height}` : undefined} className="block w-full" role="group" aria-label={t("dynamics")} aria-describedby={id} data-statistics-baseline={y(0)}>
        <desc id={id}>{t("dynamicsDescription")}</desc>
        {measured ? <>
          {[min, (min + max) / 2, max].map((value, index) => <g key={index}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--ui-border)" strokeDasharray="3 5"/>
            <text x={left - 10} y={y(value) + 4} textAnchor="end" fill="var(--ui-text-muted)" fontSize="10">{new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text>
          </g>)}
          <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} stroke="var(--ui-border-strong)"/>
          {points.map((point, index) => {
            const barWidth = Math.min(24, step * 0.28), gap = Math.min(6, step * 0.08);
            return <g key={point.month}>
              {selected === index ? <rect x={x(index) - step / 2 + 2} y={top - 8} width={Math.max(0, step - 4)} height={bottom - top + 8} fill="var(--ui-surface-muted)" rx="4"/> : null}
              <g data-statistics-bar>{(["incoming", "outgoing"] as const).map((direction, offset) => {
                const amount = point[direction];
                return amount === null ? <text key={direction} x={x(index) + (offset ? 8 : -8)} y={y(0) - 6} textAnchor="middle" fontSize="12" fill="var(--ui-text-muted)">—</text>
                  : <rect key={direction} x={x(index) + (offset ? gap / 2 : -barWidth - gap / 2)} y={Math.min(y(Number(amount)), y(0))} width={barWidth} height={Math.abs(y(Number(amount)) - y(0))} rx="3" fill={offset ? cashOutColor : cashInColor}/>;
              })}</g>
              {index === points.length - 1 || (index % tickEvery === 0 && points.length - 1 - index >= tickEvery) ? <text x={x(index)} y={bottom + 25} textAnchor="middle" fill="var(--ui-text-muted)" fontSize="10">{monthLabel(point.month)}</text> : null}
              <rect data-point={index} x={x(index) - step / 2} y={top - 8} width={step} height={bottom - top + 12} fill="transparent" role="button" tabIndex={index === (selected ?? 0) ? 0 : -1} aria-label={summary(point)}
                onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={() => setSelected(index)} onBlur={() => setSelected(null)}
                onKeyDown={event => {
                  if (event.key === "Escape") setSelected(null);
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(index); }
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    container.current?.querySelector<SVGElement>(`[data-point="${index + (event.key === "ArrowRight" ? 1 : -1)}"]`)?.focus();
                  }
                }}><title>{summary(point)}</title></rect>
            </g>;
          })}
        </> : null}
      </svg>
      {active && selected !== null ? <div aria-hidden="true" data-testid="monthly-cash-tooltip" className="pointer-events-none absolute top-1 z-10 w-64 max-w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-3 text-xs shadow-[var(--ui-shadow-popover)]" style={{ left: `${Math.min(98, Math.max(2, x(selected) / width * 100))}%`, transform: x(selected) > width / 2 ? "translateX(-100%)" : undefined }}>
        <p className="mb-2 font-medium capitalize text-[var(--ui-text-secondary)]">{monthLabel(active.month, true)}</p>
        <dl className="space-y-2">{([["received", active.incoming, cashInColor], ["spent", active.outgoing, cashOutColor], ["net", active.net, "var(--ui-text)"]] as const).map(([label, amount, color]) => <div key={label} className={`flex justify-between gap-3 ${label === "net" ? "border-t border-[var(--ui-border)] pt-2 font-semibold" : ""}`}><dt className="flex items-center gap-2"><span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: color }}/>{t(label)}</dt><dd className="tabular-nums">{money(amount)}</dd></div>)}</dl>
        <p className="mt-2 text-right text-[var(--ui-text-muted)]">{currency.code}</p>
        {!active.recorded ? <p className="mt-1 text-[var(--ui-text-muted)]">{t("emptyActual")}</p> : null}
      </div> : null}
      <p className="sr-only" aria-live="polite">{active ? summary(active) : ""}</p>
    </div> : <p className="flex min-h-40 items-center justify-center text-sm text-[var(--ui-text-secondary)]">{safe ? t("emptyActual") : o("chartScale")}</p>}
    <AnimatedDisclosure title={o("chartData")} defaultOpen={!safe} className="text-xs [&>button]:text-xs">
      <div className="max-h-64 overflow-auto"><table className="w-full text-left text-xs [&_th]:p-2 [&_td]:p-2"><caption className="sr-only">{t("dynamics")}</caption><thead><tr><th scope="col">{t("month")}</th>{["received", "spent", "net"].map(label => <th key={label} scope="col" className="text-right">{t(label)} · {currency.code}</th>)}</tr></thead><tbody>{points.map(point => <tr key={point.month} className="border-t border-[var(--ui-border)]"><th scope="row" className="font-normal">{monthLabel(point.month)}</th>{[point.incoming, point.outgoing, point.net].map((amount, index) => <td key={index} className="text-right tabular-nums">{money(amount)}</td>)}</tr>)}</tbody></table></div>
    </AnimatedDisclosure>
  </div>;
}
