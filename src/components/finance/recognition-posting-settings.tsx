"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { saveFinanceManagement } from "@/app/(app)/finance/reports/actions";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { formatDateOnly } from "@/lib/utils";
import type { FinanceSettings } from "@/lib/finance";
import { FinanceActionForm } from "./finance-action-form";

export function RecognitionPostingSettings({ settings, today }: { settings: FinanceSettings; today: string }) {
  const t = useTranslations("Finance.management.posting"), locale = useLocale(), router = useRouter();
  const boundary = settings.recognition_start_month;
  const status = boundary ? boundary > today ? "scheduled" : "enabled" : "disabled";
  return <div id="recognition-posting" className="border-t border-[var(--ui-border-subtle)] pt-1">
    <AnimatedDisclosure title={t("status", { status: t(status) })}>
      {boundary ? <p className="pb-2 text-xs text-[var(--ui-text-muted)]">{t("boundary", { date: settings.recognition_enabled_at
        ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Kyiv" }).format(new Date(settings.recognition_enabled_at))
        : formatDateOnly(boundary, locale) })}</p> : <FinanceActionForm action={saveFinanceManagement} label={t("enable")} onSaved={() => router.refresh()}>
        <input type="hidden" name="intent" value="activation" />
        <p className="max-w-lg text-sm text-[var(--ui-text-secondary)]">{t("enableHelp")}</p>
      </FinanceActionForm>}
    </AnimatedDisclosure>
  </div>;
}
