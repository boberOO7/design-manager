"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function BoundedDashboardList({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>();

  useLayoutEffect(() => {
    const list = ref.current?.querySelector("ul");
    if (!(list instanceof HTMLElement)) return;
    const rows = Array.from(list.children).filter((row): row is HTMLElement => row instanceof HTMLElement);
    const measure = () => {
      const last = rows[5];
      setMaxHeight(last ? last.offsetTop + last.offsetHeight - rows[0].offsetTop : undefined);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    rows.slice(0, 6).forEach((row) => observer.observe(row));
    measure();
    return () => observer.disconnect();
  }, [children]);

  return <div ref={ref} className="overflow-y-auto" style={{ maxHeight }}>{children}</div>;
}
