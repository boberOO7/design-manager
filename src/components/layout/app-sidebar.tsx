"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { StudioFlowMark } from "@/components/brand/studioflow-mark";
import { cn } from "@/lib/utils";
import { getNavigationItems, isNavigationItemActive, navigationIcons } from "@/constants/navigation";

export function AppSidebar({ studioName, systemRole }: { studioName: string | null; systemRole: string }) {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  const items = useMemo(() => getNavigationItems(systemRole), [systemRole]);

  return (
    <aside className="hidden w-72 border-r border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] lg:flex lg:flex-col">
      <div className="flex h-[var(--ui-shell-header-height)] shrink-0 items-center border-b border-[var(--ui-border)] px-5">
        <Link
          href="/dashboard"
          aria-label={t("home")}
          className="flex min-w-0 items-center gap-3 rounded-[var(--ui-radius-control)] text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
        >
          <StudioFlowMark className="h-7 text-[var(--ui-text)]" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{studioName ?? t("studioFallback")}</span>
          </span>
        </Link>
      </div>
      <nav aria-label={t("main")} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
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
      <p className="shrink-0 border-t border-[var(--ui-border)] px-5 py-3 text-xs text-[var(--ui-text-muted)]">
        {t("poweredBy", { product: "StudioFlow" })}
      </p>
    </aside>
  );
}
