"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function FinanceNavigation() {
  const t = useTranslations("Finance");
  const pathname = usePathname();
  return <nav aria-label={t("title")} className="mx-auto mb-6 flex w-full max-w-4xl gap-4 border-b border-[var(--ui-border)] text-sm">
    {[["/finance", t("accounts")], ["/finance/movements", t("movements.title")]].map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className="border-b-2 border-transparent pb-3 text-[var(--ui-text-secondary)] aria-[current=page]:border-[var(--ui-text)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--ui-text)]">{label}</Link>)}
  </nav>;
}
