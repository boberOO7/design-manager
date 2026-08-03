"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { StudioFlowMark } from "@/components/brand/studioflow-mark";
import type { Profile } from "@/types";
import { cn } from "@/lib/utils";
import { getNavigationItems, isNavigationItemActive, navigationIcons } from "@/constants/navigation";

export function AppSidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Filter navigation items based on real system_role
  const items = useMemo(() => getNavigationItems(profile), [profile]);

  return (
    <aside className={cn("hidden border-r border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] lg:flex lg:flex-col", collapsed ? "w-20" : "w-72")}>
      <div className={cn("flex items-center justify-between border-b border-[var(--ui-border)] py-4", collapsed ? "px-2" : "px-5")}>
        <Link
          href="/dashboard"
          aria-label="StudioFlow home"
          className={cn("flex min-w-0 items-center rounded-[var(--ui-radius-control)] text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", collapsed ? "p-1" : "gap-3")}
        >
          <StudioFlowMark className="h-6" />
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block text-sm font-semibold">StudioFlow</span>
              <span className="block text-xs text-[var(--ui-text-muted)]">Interior design ops</span>
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((value) => !value)}
          className="shrink-0 rounded-[var(--ui-radius-control)] p-2 text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = navigationIcons[item.href];
          const active = isNavigationItemActive(pathname, item.href);
          return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-[var(--ui-radius-control)] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", active ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)]", collapsed && "justify-center px-2")}>
              <Icon size={18} />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--ui-border)] p-4 text-sm text-[var(--ui-text-secondary)]">
        {profile && (
          <>
            <p className="font-semibold text-[var(--ui-text)]">{profile.full_name}</p>
            <p>{profile.job_title}</p>
          </>
        )}
      </div>
    </aside>
  );
}
