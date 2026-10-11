"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ShellControl } from "@/components/layout/shell-control";
import { localeCookieName, type AppLocale } from "@/i18n/config";
import { Tooltip } from "@/components/ui/tooltip";

export function LanguageSelector() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const t = useTranslations("Account");

  const nextLocale: AppLocale = locale === "en" ? "uk" : "en";
  const label = t(nextLocale === "en" ? "switchToEnglish" : "switchToUkrainian");

  function switchLocale() {
    document.cookie = `${localeCookieName}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return <Tooltip content={label}><ShellControl
    aria-label={label}
    onClick={switchLocale}
    className="min-w-11 gap-1.5 px-2.5 font-semibold tracking-wide"
  >
    <Languages size={16} aria-hidden="true" />
    <span className="text-xs leading-none">{locale === "en" ? "EN" : "УКР"}</span>
  </ShellControl></Tooltip>;
}
