"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { CrmBlueprint } from "@/components/crm/crm-blueprint";

export default function CrmLoading() {
  const t = useTranslations("Common");
  const pathname = usePathname();
  if (pathname === "/crm" || pathname.startsWith("/crm/leads")) return <CrmBlueprint />;
  return <div aria-busy="true" aria-label={t("loading")} className="space-y-6"><div className="h-20 animate-pulse rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)]" /><div className="h-80 animate-pulse rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)]" /></div>;
}
