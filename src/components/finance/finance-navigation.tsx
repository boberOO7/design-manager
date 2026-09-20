"use client";
import * as Popover from "@radix-ui/react-popover";
import { Settings2, Tags, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function FinanceNavigation() {
  const t = useTranslations("Finance");
  const pathname = usePathname();
  const manageActive = pathname === "/finance/accounts" || pathname === "/finance/categories";
  const linkClassName = "flex min-h-11 items-center border-b-2 border-transparent text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none aria-[current=page]:border-[var(--ui-text)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--ui-text)] sm:min-h-0 sm:pb-3";
  return <nav aria-label={t("title")} className="mx-auto mb-6 flex w-full max-w-7xl items-end gap-x-4 border-b border-[var(--ui-border)] text-sm">
    <div className="flex min-w-0 flex-1 flex-wrap gap-x-4">
      {[["/finance", t("overview.title")], ["/finance/planning", t("forecast.title")], ["/finance/movements", t("movements.title")], ["/finance/expected", t("planning.title")], ["/finance/schedules", t("schedules.title")]].map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={linkClassName}>{label}</Link>)}
    </div>
    <Popover.Root><Popover.Trigger asChild><button type="button" aria-current={manageActive ? "page" : undefined} aria-haspopup="menu" aria-label={t("manageFinance")} className="mb-2 flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none aria-[current=page]:bg-[var(--ui-surface-muted)] aria-[current=page]:text-[var(--ui-text)] sm:mb-1 sm:size-9"><Settings2 className="size-4" aria-hidden="true"/></button></Popover.Trigger>
      <Popover.Portal><Popover.Content role="menu" align="end" sideOffset={6} collisionPadding={8} className="z-[80] min-w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]">
        <Link role="menuitem" href="/finance/accounts" className="flex min-h-11 items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none sm:min-h-9"><WalletCards className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true"/>{t("accounts")}</Link>
        <Link role="menuitem" href="/finance/categories" className="flex min-h-11 items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none sm:min-h-9"><Tags className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true"/>{t("planning.categories")}</Link>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </nav>;
}
