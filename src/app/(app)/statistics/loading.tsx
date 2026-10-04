import { getTranslations } from "next-intl/server";

export default async function StatisticsLoading() {
  const t = await getTranslations("Statistics");
  return <div role="status" aria-label={t("loading")} className="space-y-5"><div className="h-9 w-52 rounded bg-[var(--ui-surface-muted)]" /><div className="grid gap-5 xl:grid-cols-[2fr_1fr]">{[0, 1].map(index => <div key={index} className="h-80 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] motion-safe:animate-pulse" />)}</div><span className="sr-only">{t("loading")}</span></div>;
}
