"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("Crm");
  return <div className="space-y-6">
    <div className="border-b border-[var(--ui-border)]"><nav aria-label={t("sectionNavigation")} className="flex gap-6">
      {[{ href: "/crm/leads", label: t("leads.title") }, { href: "/crm/candidates", label: t("candidates.title") }].map((item) => {
        const active = pathname.startsWith(item.href);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("min-h-11 border-b-2 px-1 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", active ? "border-[var(--ui-text)] text-[var(--ui-text)]" : "border-transparent text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]")}>{item.label}</Link>;
      })}
    </nav></div>
    {children}
  </div>;
}
