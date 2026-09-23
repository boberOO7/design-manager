"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

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
    const row = rows[0]?.firstElementChild;
    const measure = () => {
      if (resizable) setRowHeight(row instanceof HTMLElement ? row.offsetHeight : undefined);
      else {
        const last = rows[5];
        setMaxHeight(last ? last.offsetTop + last.offsetHeight - rows[0].offsetTop : undefined);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    if (resizable && row instanceof HTMLElement) observer.observe(row);
    else rows.slice(0, 6).forEach((item) => observer.observe(item));
    measure();
    return () => observer.disconnect();
  }, [children, resizable]);

  function resizeStart(event: PointerEvent<HTMLButtonElement>) {
    if (!rowHeight) return;
    drag.current = { y: event.clientY, rows: visibleRows, rowHeight: rowHeight + 4 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizeMove(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const next = Math.max(MIN_WORKLOAD_ROWS, Math.min(MAX_WORKLOAD_ROWS, drag.current.rows + Math.round((event.clientY - drag.current.y) / drag.current.rowHeight)));
    setVisibleRows(next);
    localStorage.setItem(WORKLOAD_CAPACITY_KEY, String(next));
  }

  return <div className={resizable ? "relative" : undefined}>
    <div ref={ref} className="overflow-y-auto" style={resizable ? (rowHeight ? { maxHeight: rowHeight * visibleRows + 4 * (visibleRows - 1) } : undefined) : { maxHeight }}>{children}</div>
    {resizable ? <button type="button" aria-label={resizeLabel} onPointerDown={resizeStart} onPointerMove={resizeMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={(event) => {
      const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (delta) {
        event.preventDefault();
        setVisibleRows((rows) => {
          const next = Math.max(MIN_WORKLOAD_ROWS, Math.min(MAX_WORKLOAD_ROWS, rows + delta));
          localStorage.setItem(WORKLOAD_CAPACITY_KEY, String(next));
          return next;
        });
      }
    }} className="absolute bottom-0 right-0 z-10 size-5 touch-none cursor-ns-resize rounded-tl text-[var(--ui-text-muted)] opacity-30 transition-opacity hover:opacity-80 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus-ring)]" title={resizeLabel}><span aria-hidden="true" className="absolute bottom-1 right-1 size-2 border-b-2 border-r-2 border-current" /></button> : null}
  </div>;
}
