"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export type StatisticsChartSegment = { key: string; label: string; value: number; display: string; color: string };
export type StatisticsChartPoint = { month: string; value: number | null; display: string; detail?: string; segments?: StatisticsChartSegment[] };

/** The existing Finance chart's native SVG approach, scoped to monthly series.
 * Missing evidence creates gaps; exact values are available on hover and focus.
 */
export function StatisticsChart({ title, unit, points, kind = "bar", color = "var(--ui-text-secondary)", compact = false, showData = true }: {
  title: string; unit: string; points: StatisticsChartPoint[]; kind?: "bar" | "line"; color?: string; compact?: boolean; showData?: boolean;
}) {
  const t = useTranslations("Statistics");
  const locale = useLocale();
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const selectedIndex = points.findIndex(point => point.month === selectedMonth && point.value !== null);
  const selected = selectedIndex >= 0 ? selectedIndex : null;
  const measured = width > 0;
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    setWidth(Math.max(240, element.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (measured) container.current?.querySelector("svg")?.dispatchEvent(new Event("statistics-chart-ready", { bubbles: true }));
  }, [measured]);
  const left = 46, right = 10, top = 20, bottom = compact ? 98 : 180, height = bottom + 32;
  const values = points.flatMap(point => point.value === null ? [] : [point.value]);
  const maximum = Math.max(1, ...values);
  const step = (width - left - right) / Math.max(1, points.length);
  const x = (index: number) => left + step * (index + 0.5);
  const y = (value: number) => bottom - value / maximum * (bottom - top);
  const label = (date: string) => new Intl.DateTimeFormat(locale, { month: "short", year: points.length > 12 ? "2-digit" : undefined, timeZone: "UTC" }).format(new Date(date));
  const tickEvery = Math.max(1, Math.ceil(points.length / (width < 480 ? 4 : 7)));
  const active = selected === null ? null : points[selected] ?? null;
  const breakdown = (point: StatisticsChartPoint) => point.segments?.map(segment => `${segment.label}: ${segment.display}`).join(" · ");
  const focusPoint = (index: number, direction: number) => {
    let next = index + direction;
    while (points[next]?.value === null) next += direction;
    container.current?.querySelector<SVGElement>(`[data-point="${next}"]`)?.focus();
  };
  // Start a new path after each unavailable interval instead of connecting it.
  const path = points.map((point, index) => point.value === null ? ""
    : `${index && points[index - 1].value !== null ? "L" : "M"}${x(index)},${y(point.value)}`).join(" ");
  let lineLength = 0;
  const dotDistances = points.map((point, index) => {
    const previous = points[index - 1];
    if (point.value !== null && previous?.value != null) lineLength += Math.hypot(x(index) - x(index - 1), y(point.value) - y(previous.value));
    return lineLength;
  });
  return <div ref={container} className="min-w-0">
    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-[var(--ui-text-muted)]"><span>{title}</span><span className="shrink-0 tabular-nums">{unit}</span></div>
    {values.length ? <div className="relative" onMouseLeave={() => setSelectedMonth(null)}>
      {/* Reserve the final SVG height on the server; plot only at the measured width. */}
      <svg data-statistics-baseline={bottom} height={height} viewBox={width ? `0 0 ${width} ${height}` : undefined} className="block w-full" role="group" aria-label={title} aria-describedby={id}>
        <desc id={id}>{t("chartDescription")}</desc>
        {width > 0 ? <>
        {[0, maximum / 2, maximum].map((value, index) => <g key={index}>
          <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--ui-border)" strokeDasharray={index ? "3 5" : undefined} />
          <text x={left - 8} y={y(value) + 4} textAnchor="end" fill="var(--ui-text-muted)" fontSize="10">{new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text>
        </g>)}
        {kind === "line" ? path.split("M").filter(run => run.trim()).map((run, index) => <path key={index} data-statistics-line d={`M${run}`} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />) : null}
        {points.map((point, index) => {
          let stacked = 0;
          const barWidth = Math.max(1, Math.round(Math.min(36, step * 0.6)));
          const barLeft = Math.round(x(index) - barWidth / 2);
          return <g key={point.month}>
          {point.value === null ? <text x={x(index)} y={bottom - 5} textAnchor="middle" fill="var(--ui-text-muted)" fontSize="12">—</text>
            : kind === "bar" ? <g data-statistics-bar>{point.segments ? point.segments.map(segment => {
              const base = stacked;
              stacked += segment.value;
              // Shared integer edges keep adjacent colors crisp without seams.
              return segment.value > 0 ? <rect key={segment.key} data-segment={segment.key} x={barLeft} y={Math.round(y(stacked))} width={barWidth} height={Math.round(y(base)) - Math.round(y(stacked))} fill={segment.color} stroke="none" shapeRendering="crispEdges" /> : null;
            }) : <rect x={x(index) - Math.min(18, step * 0.3)} y={y(point.value)} width={Math.min(36, step * 0.6)} height={bottom - y(point.value)} rx="2" fill={color} fillOpacity={selected === index ? 1 : 0.8} />}</g>
              : <circle data-statistics-dot={lineLength ? dotDistances[index] / lineLength : 0} cx={x(index)} cy={y(point.value)} r={selected === index ? 4.5 : 3} fill="var(--ui-surface)" stroke={color} strokeWidth="2" />}
          {index === points.length - 1 || (index % tickEvery === 0 && points.length - 1 - index >= tickEvery) ? <text x={x(index)} y={bottom + 22} textAnchor={index === points.length - 1 ? "end" : index === 0 ? "start" : "middle"} fill="var(--ui-text-muted)" fontSize="10">{label(point.month)}</text> : null}
          {point.value !== null ? <rect data-point={index} x={x(index) - step / 2} y={top} width={step} height={bottom - top}
            fill="transparent" role="button" tabIndex={index === (selected ?? points.findIndex(point => point.value !== null)) ? 0 : -1}
            aria-label={`${point.month.slice(0, 7)} · ${title} · ${point.display}${breakdown(point) ? ` · ${breakdown(point)}` : ""}${point.detail ? ` · ${point.detail}` : ""}`}
            onFocus={() => setSelectedMonth(point.month)} onMouseEnter={() => setSelectedMonth(point.month)} onClick={() => setSelectedMonth(point.month)}
            onKeyDown={event => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); focusPoint(index, event.key === "ArrowRight" ? 1 : -1); }
              if (event.key === "Escape") setSelectedMonth(null);
            }}><title>{point.display}</title></rect> : null}
        </g>; })}
        {active?.value != null && selected !== null ? <line aria-hidden="true" x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} stroke="var(--ui-focus)" strokeDasharray="3 4" pointerEvents="none" /> : null}
        </> : null}
      </svg>
      {active?.value != null && selected !== null ? <div aria-hidden="true" className="pointer-events-none absolute top-0 z-10 w-max max-w-[min(16rem,100%)] rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-xs shadow-[var(--ui-shadow-popover)]"
        style={{ left: `${Math.min(98, Math.max(2, x(selected) / width * 100))}%`, transform: x(selected) > width / 2 ? "translateX(-100%)" : undefined }}>
        <p className="text-[var(--ui-text-muted)]">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(active.month))}</p>
        <p className="mt-1 font-semibold tabular-nums text-[var(--ui-text)]">{active.segments ? `${t("total")}: ` : ""}{active.display}{active.segments ? <span className="font-normal text-[var(--ui-text-muted)]"> {unit}</span> : null}</p>
        {active.segments?.length ? <ul className="mt-2 space-y-1.5">{active.segments.map(segment => <li key={segment.key} className={`flex items-center gap-2 ${segment.value ? "text-[var(--ui-text-secondary)]" : "text-[var(--ui-text-muted)]"}`}><span aria-hidden="true" className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} /><span>{segment.label}</span><span className="ml-auto pl-3 tabular-nums">{segment.display}</span></li>)}</ul> : null}
        {active.detail ? <p className="mt-1 leading-5 text-[var(--ui-text-secondary)]">{active.detail}</p> : null}
      </div> : null}
      <p className="sr-only" aria-live="polite">{active ? `${active.month.slice(0, 7)} · ${active.display} · ${breakdown(active) ?? ""} · ${active.detail ?? ""}` : ""}</p>
    </div> : <p className="py-5 text-sm leading-6 text-[var(--ui-text-muted)]">{t("noPeriodData")}</p>}
    {showData ? <details className="group mt-1 text-xs text-[var(--ui-text-muted)]">
      <summary className="w-fit cursor-pointer rounded-[var(--ui-radius-control)] py-2 transition-colors duration-[180ms] hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{t("chartData")}</summary>
      <div className="max-h-64 overflow-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)]">
        <table className="w-full text-left text-xs [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2"><caption className="sr-only">{title}</caption>
          <thead className="bg-[var(--ui-surface-muted)]"><tr><th scope="col">{t("month")}</th><th scope="col">{title}</th></tr></thead>
          <tbody>{points.map(point => <tr key={point.month} className="border-t border-[var(--ui-border)]"><th scope="row" className="font-normal">{point.month.slice(0, 7)}</th><td className="tabular-nums">{point.display}{point.detail ? <span className="block text-[var(--ui-text-muted)]">{point.detail}</span> : null}</td></tr>)}</tbody>
        </table>
      </div>
    </details> : null}
  </div>;
}
