"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const WORKLOAD_CAPACITY_KEY = "dashboard-workload-visible-rows";
const MIN_WORKLOAD_ROWS = 4;
const MAX_WORKLOAD_ROWS = 15;

export function BoundedDashboardList({ children, resizable = false, resizeLabel }: { children: ReactNode; resizable?: boolean; resizeLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; rows: number; rowHeight: number } | null>(null);
  const [rowHeight, setRowHeight] = useState<number>();
  const [maxHeight, setMaxHeight] = useState<number>();
  const [visibleRows, setVisibleRows] = useState(10);

  useLayoutEffect(() => {
    if (!resizable) return;
    const value = localStorage.getItem(WORKLOAD_CAPACITY_KEY);
    const stored = value === null ? NaN : Number(value);
    if (Number.isInteger(stored)) setVisibleRows(Math.max(MIN_WORKLOAD_ROWS, Math.min(MAX_WORKLOAD_ROWS, stored)));
  }, [resizable]);

  useLayoutEffect(() => {
    const list = ref.current?.querySelector("ul");
    if (!(list instanceof HTMLElement)) return;
    const rows = Array.from(list.children).filter((row): row is HTMLElement => row instanceof HTMLElement);
    const surfaces = rows.map((row) => row.firstElementChild).filter((row): row is HTMLElement => row instanceof HTMLElement);
    const measure = () => {
      if (resizable) {
        setRowHeight(surfaces[0]?.getBoundingClientRect().height);
        const visible = surfaces.slice(0, visibleRows);
        setMaxHeight(visible.reduce((height, row) => height + row.getBoundingClientRect().height, 0) + 4 * Math.max(0, visible.length - 1));
      }
      else {
        const last = rows[5];
        setMaxHeight(last ? last.offsetTop + last.offsetHeight - rows[0].offsetTop : undefined);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    if (resizable) surfaces.forEach((row) => observer.observe(row));
    else rows.slice(0, 6).forEach((item) => observer.observe(item));
    measure();
    return () => observer.disconnect();
  }, [children, resizable, visibleRows]);

  function resizeStart(event: PointerEvent<HTMLButtonElement>) {
    if (!rowHeight || event.button !== 0) return;
    drag.current = { y: event.clientY, rows: visibleRows, rowHeight: rowHeight + 4 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizeMove(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const next = Math.max(MIN_WORKLOAD_ROWS, Math.min(MAX_WORKLOAD_ROWS, drag.current.rows + Math.round((event.clientY - drag.current.y) / drag.current.rowHeight)));
    setVisibleRows(next);
    localStorage.setItem(WORKLOAD_CAPACITY_KEY, String(next));
  }

  return <div className={resizable ? "relative pb-2" : undefined}>
    <div ref={ref} className={cn("overflow-y-auto [scrollbar-gutter:stable]", resizable && "[scrollbar-gutter:stable_both-edges]")} style={{ maxHeight }}>{children}</div>
    {resizable ? <Tooltip content={resizeLabel}><button type="button" aria-label={resizeLabel} onPointerDown={resizeStart} onPointerMove={resizeMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} onKeyDown={(event) => {
      const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (delta) {
        event.preventDefault();
        setVisibleRows((rows) => {
          const next = Math.max(MIN_WORKLOAD_ROWS, Math.min(MAX_WORKLOAD_ROWS, rows + delta));
          localStorage.setItem(WORKLOAD_CAPACITY_KEY, String(next));
          return next;
        });
      }
    }} className="absolute bottom-0 right-0 z-10 size-6 touch-none cursor-ns-resize select-none rounded-br-[calc(var(--ui-radius-panel)-1px)] text-[var(--ui-text-muted)] [clip-path:polygon(100%_0,100%_100%,0_100%)] transition-colors duration-[180ms] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:bg-[var(--ui-surface-muted)] focus-visible:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="absolute bottom-0 right-0 size-5"><path d="M5 16a11 11 0 0 0 11-11M10 16a6 6 0 0 0 6-6" /></svg></button></Tooltip> : null}
  </div>;
}
