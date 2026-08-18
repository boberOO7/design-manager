"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SpaceLogoFull } from "@/components/brand/space-logo-full";
import { StudioFlowMark } from "@/components/brand/studioflow-mark";
import { cn } from "@/lib/utils";
import { getNavigationItems, isNavigationItemActive, navigationIcons } from "@/constants/navigation";

export function AppSidebar({ systemRole }: { systemRole: string }) {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  const items = useMemo(() => getNavigationItems(systemRole), [systemRole]);
  const [isHovering, setIsHovering] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const pointerLeaveTimeoutRef = useRef<number | null>(null);
  const isExpanded = isHovering || hasFocusWithin;

  const clearPointerLeaveTimeout = () => {
    if (!pointerLeaveTimeoutRef.current) return;
    window.clearTimeout(pointerLeaveTimeoutRef.current);
    pointerLeaveTimeoutRef.current = null;
  };

  const expandForInteraction = () => {
    clearPointerLeaveTimeout();
    setIsHovering(true);
  };

  const collapseAfterPointerLeave = () => {
    clearPointerLeaveTimeout();
    pointerLeaveTimeoutRef.current = window.setTimeout(() => {
      setIsHovering(false);
      pointerLeaveTimeoutRef.current = null;
    }, 80);
  };

  useEffect(() => () => clearPointerLeaveTimeout(), []);

  return (
    <aside
      className={cn(
        "hidden shrink-0 overflow-hidden border-r border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] [width:var(--sidebar-width)] transition-[width] duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none lg:flex lg:flex-col",
        isExpanded ? "w-72" : "w-20",
      )}
      style={{ "--sidebar-width": isExpanded ? "18rem" : "5rem" } as React.CSSProperties}
      onPointerEnter={expandForInteraction}
      onPointerLeave={collapseAfterPointerLeave}
      onFocusCapture={() => {
        clearPointerLeaveTimeout();
        setHasFocusWithin(true);
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setHasFocusWithin(false);
      }}
    >
      <div className="flex h-[var(--ui-shell-header-height)] shrink-0 items-center border-b border-[var(--ui-border)] px-2">
        <Link
          href="/dashboard"
          aria-label={t("home")}
          className="relative flex h-11 w-full items-center rounded-[var(--ui-radius-control)] text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
        >
          <StudioFlowMark className={cn("absolute left-[17.5px] h-7 text-[var(--ui-text)] transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none", isExpanded ? "scale-90 opacity-0" : "scale-100 opacity-100")} />
          <SpaceLogoFull className={cn("absolute left-[17.5px] h-10 w-[91px] transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none", isExpanded ? "translate-x-0 opacity-100" : "translate-x-1 opacity-0")} />
        </Link>
      </div>
      <nav aria-label={t("main")} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {items.map((item) => {
          const Icon = navigationIcons[item.href];
          const active = isNavigationItemActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} title={t(item.messageKey)} className={cn("relative flex min-h-11 items-center overflow-hidden rounded-[var(--ui-radius-control)] text-sm font-medium transition-[background-color,color] duration-[200ms] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", active ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)]")}>
              <Icon className="absolute left-[23px] top-1/2 size-[18px] -translate-y-1/2" aria-hidden="true" />
              <span className={cn("ml-[52px] min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none", isExpanded ? "max-w-48 translate-x-0 opacity-100" : "max-w-0 translate-x-[-0.25rem] opacity-0")}>
                {t(item.messageKey)}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className={cn("shrink-0 overflow-hidden border-t border-[var(--ui-border)] transition-[max-height,opacity,border-color] duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none", isExpanded ? "max-h-12 opacity-100" : "max-h-0 border-transparent opacity-0")}>
        <p className="px-5 py-3 text-xs text-[var(--ui-text-muted)]">{t("poweredBy", { product: "StudioFlow" })}</p>
      </div>
    </aside>
  );
}
