"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { localeCookieName, type AppLocale } from "@/i18n/config";

export function LanguageSelector() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const t = useTranslations("Account");

  function changeLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) return;
    document.cookie = `${localeCookieName}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return <label className="flex min-h-11 items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] px-2 text-[var(--ui-text-secondary)]">
    <Languages size={16} aria-hidden="true" />
    <span className="sr-only">{t("language")}</span>
    <select aria-label={t("language")} value={locale} onChange={(event) => changeLocale(event.target.value as AppLocale)} className="min-w-0 bg-transparent text-sm font-medium outline-none">
      <option value="en">English</option>
      <option value="uk">Українська</option>
    </select>
  </label>;
}
