"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { StudioFlowMark } from "@/components/brand/studioflow-mark";
import type { Profile } from "@/types";
import { cn } from "@/lib/utils";
import { getNavigationItems, isNavigationItemActive, navigationIcons } from "@/constants/navigation";

export function AppSidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  // Filter navigation items based on real system_role
  const items = useMemo(() => getNavigationItems(profile), [profile]);

  return (
    <aside className="hidden w-72 border-r border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] lg:flex lg:flex-col">
      <div className="flex h-[var(--ui-shell-header-height)] shrink-0 items-center border-b border-[var(--ui-border)] px-5">
        <Link
          href="/dashboard"
          aria-label={t("home")}
          className="flex min-w-0 items-center gap-3 rounded-[var(--ui-radius-control)] text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
        >
          <StudioFlowMark className="h-6" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">StudioFlow</span>
            <span className="block text-xs text-[var(--ui-text-muted)]">{t("tagline")}</span>
          </span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = navigationIcons[item.href];
          const active = isNavigationItemActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-[var(--ui-radius-control)] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", active ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)]")}>
              <Icon size={18} />
              <span>{t(item.messageKey)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
