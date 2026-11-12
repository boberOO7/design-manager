"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CrmShell({ action, children }: { action?: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("Crm");
  const candidatesActive = pathname.startsWith("/crm/candidates");
  const section = candidatesActive ? "candidates" : "leads";
  const Heading = pathname === "/crm/leads/meta" ? "span" : "h1";
  // CRM owns its data-only reveal; skip the global navigation translate animation.
  return <div data-instaload-ready="crm" className="space-y-4">
    <header className="flex flex-wrap items-center gap-3 sm:gap-4">
      <div className="flex shrink-0 items-center gap-1">
        <Heading className="text-xl font-semibold sm:text-2xl text-[var(--ui-text)]">{t("title")}</Heading>
        <Tooltip content={t(`${section}.description`)} openOnClick><button type="button" aria-label={t("sectionHelp", { section: t(`${section}.title`) })} className="flex size-8 items-center sm:size-9 justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none"><Info className="size-4" aria-hidden="true" /></button></Tooltip>
      </div>
      <nav aria-label={t("sectionNavigation")} className="relative inline-grid grid-cols-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">
        <span aria-hidden="true" className={cn("pointer-events-none absolute bottom-1 left-1 top-1 rounded-[calc(var(--ui-radius-control)-2px)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] transition-transform duration-200 ease-out motion-reduce:transition-none", candidatesActive && "translate-x-full")} style={{ width: "calc((100% - 0.5rem) / 2)" }} />
        {[{ href: "/crm/leads", label: t("leads.title") }, { href: "/crm/candidates", label: t("candidates.title") }].map((item) => {
          const active = pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("relative z-10 flex min-h-9 items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] px-2.5 text-sm font-medium transition-colors duration-200 sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none", active ? "text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)] hover:text-[var(--ui-text)]")}>{item.label}</Link>;
        })}
      </nav>
      {action ? <div className="ml-auto w-full sm:w-auto">{action}</div> : null}
    </header>
    {children}
  </div>;
}
