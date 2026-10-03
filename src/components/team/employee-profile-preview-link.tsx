"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function EmployeeProfilePreviewLink({ href, title, className, children }: {
  href: string;
  title: string;
  className: string;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const reveal = (element: HTMLAnchorElement) => {
    const heading = element.querySelector<HTMLElement>("[data-preview-title]");
    if (!heading || heading.scrollWidth <= heading.clientWidth) return;
    const box = heading.getBoundingClientRect();
    const halfWidth = Math.min(320, window.innerWidth - 24) / 2;
    const above = box.top > 120;
    setTooltip({
      left: Math.max(halfWidth + 12, Math.min(window.innerWidth - halfWidth - 12, box.left + box.width / 2)),
      top: above ? box.top - 8 : box.bottom + 8,
      above,
    });
  };

  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [tooltip]);

  return <>
    <Link href={href} className={className} aria-describedby={tooltip ? tooltipId : undefined}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") reveal(event.currentTarget); }}
      onPointerLeave={(event) => { if (document.activeElement !== event.currentTarget) setTooltip(null); }}
      onFocus={(event) => reveal(event.currentTarget)} onBlur={() => setTooltip(null)}
      onKeyDown={(event) => { if (event.key === "Escape") setTooltip(null); }}>
      {children}
    </Link>
    {tooltip ? createPortal(<div id={tooltipId} role="tooltip"
      className="pointer-events-none fixed z-50 w-[min(20rem,calc(100vw-1.5rem))] break-words rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-xs leading-5 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]"
      style={{ left: tooltip.left, top: tooltip.top, transform: `translate(-50%, ${tooltip.above ? "-100%" : "0"})` }}>
      {title}
    </div>, document.body) : null}
  </>;
}
