"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function MovementsError({ reset }: { reset: () => void }) {
  const t = useTranslations("Finance.movements.filters");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div role="alert" className="space-y-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5">
    <h1 className="text-lg font-semibold">{t("loadError")}</h1>
    <p className="text-sm text-[var(--ui-text-secondary)]">{t("loadErrorHelp")}</p>
    <Button disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset(); })}>{t("retry")}</Button>
  </div>;
}
