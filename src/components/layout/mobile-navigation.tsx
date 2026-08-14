"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getNavigationItems, isNavigationItemActive, navigationIcons } from "@/constants/navigation";
import { StudioFlowMark } from "@/components/brand/studioflow-mark";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

const mobileNavigationId = "mobile-application-navigation";

export function MobileNavigation({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const items = getNavigationItems(profile);

  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-controls={mobileNavigationId}
      aria-expanded={open}
      aria-label={t("open")}
      className="inline-flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] lg:hidden"
      onClick={() => setOpen(true)}
    >
      <Menu size={20} aria-hidden="true" />
    </button>
    <Drawer isOpen={open} onClose={() => setOpen(false)} returnFocusRef={triggerRef} side="left" title={t("title")}>
      <div id={mobileNavigationId} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-5 py-4">
          <Link
            href="/dashboard"
            aria-label={t("home")}
            className="flex items-center gap-3 rounded-[var(--ui-radius-control)] text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
            onClick={() => setOpen(false)}
          >
            <StudioFlowMark className="h-6" />
            <span>
              <span className="block text-sm font-semibold">StudioFlow</span>
              <span className="block text-xs text-[var(--ui-text-muted)]">{t("tagline")}</span>
            </span>
          </Link>
          <button type="button" aria-label={t("close")} className="inline-flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => setOpen(false)}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label={t("main")} className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const Icon = navigationIcons[item.href];
            const active = isNavigationItemActive(pathname, item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={cn("flex min-h-11 items-center gap-3 rounded-[var(--ui-radius-control)] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", active ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)]")}>
              <Icon size={18} aria-hidden="true" />
              {item.href === "/contractors" ? item.label : t(item.messageKey)}
            </Link>;
          })}
        </nav>
      </div>
    </Drawer>
  </>;
}
