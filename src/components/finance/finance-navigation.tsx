"use client";
import * as Popover from "@radix-ui/react-popover";
import { Settings2, Tags, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

export function FinanceNavigation() {
  const t = useTranslations("Finance");
  const pathname = usePathname();
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabs.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  const manageActive = pathname === "/finance/accounts" || pathname === "/finance/categories";
  const linkClassName = "flex min-h-11 items-center rounded-[var(--ui-radius-control)] border border-transparent px-3 py-2 text-[var(--ui-text-secondary)] transition-colors duration-[220ms] hover:bg-[var(--ui-surface)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none aria-[current=page]:border-[var(--ui-border-strong)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--ui-text)]";
  return <nav aria-label={t("title")} className="mx-auto mb-6 flex w-full max-w-[var(--finance-content-width,80rem)] items-start gap-2 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-1.5 text-sm">
    <div ref={tabs} className="-m-1 flex min-w-0 flex-1 scroll-px-1 gap-1 overflow-x-auto p-1 sm:flex-wrap [&>a]:shrink-0">
      {[["/finance", t("overview.title")], ["/finance/planning", t("forecast.title")], ["/finance/movements", t("movements.title")], ["/finance/expected", t("planning.title")], ["/finance/schedules", t("schedules.title")]].map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={linkClassName}>{label}</Link>)}
    </div>
    <Popover.Root><Popover.Trigger asChild><button type="button" aria-current={manageActive ? "page" : undefined} aria-haspopup="menu" aria-label={t("manageFinance")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] transition-colors duration-[220ms] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none aria-[current=page]:bg-[var(--ui-surface-muted)] aria-[current=page]:text-[var(--ui-text)]"><Settings2 className="size-4" aria-hidden="true"/></button></Popover.Trigger>
      <Popover.Portal><Popover.Content role="menu" align="end" sideOffset={6} collisionPadding={8} className="z-[80] min-w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]">
        <Link role="menuitem" href="/finance/accounts" className="flex min-h-11 items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium text-[var(--ui-text)] transition-colors duration-[220ms] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none sm:min-h-9"><WalletCards className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true"/>{t("accounts")}</Link>
        <Link role="menuitem" href="/finance/categories" className="flex min-h-11 items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium text-[var(--ui-text)] transition-colors duration-[220ms] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none sm:min-h-9"><Tags className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true"/>{t("planning.categories")}</Link>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </nav>;
}
