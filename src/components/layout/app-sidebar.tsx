"use client";

import Link from "next/link";
import { ProjectsListLink } from "@/components/projects/projects-list-link";
import { usePathname } from "next/navigation";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { StudioFlowMark } from "@/components/brand/studioflow-mark";
import { cn } from "@/lib/utils";
import { formatNavigationAttentionCount, getNavigationItems, isNavigationItemActive, navigationIcons } from "@/constants/navigation";
import { Tooltip } from "@/components/ui/tooltip";

export function AppSidebar({ crmAttentionCount, leaderboardVisibleToEmployees, systemRole }: { crmAttentionCount: number; leaderboardVisibleToEmployees: boolean; systemRole: string }) {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  const items = useMemo(() => getNavigationItems(systemRole, leaderboardVisibleToEmployees), [leaderboardVisibleToEmployees, systemRole]);
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

  const blurAfterPointerNavigation = (event: PointerEvent<HTMLAnchorElement>) => {
    event.currentTarget.blur();
  };

  useEffect(() => () => clearPointerLeaveTimeout(), []);

  const logo = (
    <div className="flex h-[var(--ui-shell-header-height)] shrink-0 items-center border-b border-[var(--ui-border)] px-2">
      <Link
        href="/dashboard"
        aria-label={t("home")}
        onPointerUp={blurAfterPointerNavigation}
        className="relative flex h-11 w-full items-center rounded-[var(--ui-radius-control)] text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
      >
        <StudioFlowMark className="absolute left-[17.5px] h-7 text-[var(--ui-text)]" />
      </Link>
    </div>
  );

  return (
    <aside
      className="relative hidden w-20 shrink-0 lg:block"
      data-app-sidebar
      data-state={isExpanded ? "open" : "closed"}
      onPointerEnter={expandForInteraction}
      onPointerLeave={collapseAfterPointerLeave}
      onFocusCapture={() => {
        setHasFocusWithin(true);
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setHasFocusWithin(false);
      }}
    >
      <div className="absolute inset-x-0 top-0 overflow-hidden border-r border-[var(--ui-border)] bg-[var(--ui-surface-subtle)]">{logo}</div>
      <div
        data-sidebar-panel
        className={cn(
          "absolute bottom-0 left-0 top-[var(--ui-shell-header-height)] z-40 flex flex-col overflow-hidden border-r border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] [clip-path:inset(0_-40px_-40px_0)] transition-[width,box-shadow] duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none",
          isExpanded && "shadow-[var(--ui-shadow-popover)]",
        )}
        style={{ width: isExpanded ? "18rem" : "5rem" }}
      >
        <nav aria-label={t("main")} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {items.map((item) => {
            const Icon = navigationIcons[item.href];
            const NavigationLink = item.href === "/projects" ? ProjectsListLink : Link;
            const active = isNavigationItemActive(pathname, item.href);
            const attentionCount = item.href === "/crm" ? crmAttentionCount : 0;
            return (
              <Tooltip content={t(item.messageKey)} contentClassName={isExpanded ? "hidden" : undefined} key={item.href}><NavigationLink href={item.href} aria-current={active ? "page" : undefined} onPointerUp={blurAfterPointerNavigation} className={cn("relative flex min-h-11 items-center overflow-hidden rounded-[var(--ui-radius-control)] text-sm font-medium transition-[background-color,color] duration-[200ms] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", active ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)]")}>
                <Icon className="absolute left-[23px] top-1/2 size-[18px] -translate-y-1/2" aria-hidden="true" />
                <span className={cn("pointer-events-none ml-[52px] shrink-0 whitespace-nowrap transition-opacity duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none", isExpanded ? "opacity-100" : "opacity-0")}>
                  {t(item.messageKey)}
                </span>
                {attentionCount > 0 ? <><span aria-hidden="true" className="absolute right-3 top-1/2 min-w-4 -translate-y-1/2 rounded-full border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-1 text-center text-[10px] font-bold leading-[14px] text-[var(--ui-danger-text)]">{formatNavigationAttentionCount(attentionCount)}</span><span className="sr-only">{t("crmAttention", { count: attentionCount })}</span></> : null}
              </NavigationLink></Tooltip>
            );
          })}
        </nav>
        <div aria-hidden={!isExpanded} className={cn("shrink-0 overflow-hidden border-t border-[var(--ui-border)] transition-[opacity,border-color] duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none", isExpanded ? "opacity-100" : "border-transparent opacity-0")}>
          <p className="whitespace-nowrap px-5 py-3 text-xs text-[var(--ui-text-muted)]">{t("poweredBy", { product: "StudioFlow" })}</p>
        </div>
      </div>
    </aside>
  );
}
