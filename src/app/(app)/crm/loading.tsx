import { getTranslations } from "next-intl/server";

export default async function CrmLoading() {
  const t = await getTranslations("Common");
  return <div aria-busy="true" aria-label={t("loading")} className="space-y-6"><div className="h-20 animate-pulse rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)]" /><div className="h-80 animate-pulse rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)]" /></div>;
}
