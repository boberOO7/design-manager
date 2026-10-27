"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { reviewAutomaticExpense } from "@/app/(app)/finance/expenses/actions";
import type { ExpenseAutomation } from "@/lib/finance-expenses";
import { FinanceActionForm } from "./finance-action-form";
import { formatDateOnly } from "@/lib/utils";

export function ExpenseAutomationDiagnostics({ data }: { data: ExpenseAutomation }) {
  const t = useTranslations("Finance.expenses"), locale = useLocale(), router = useRouter();
  const blocked = data.candidates.filter(candidate => candidate.issue !== null);
  if (!blocked.length && !data.missingFx.length) return null;
  return <div className="space-y-3 text-sm text-[var(--ui-warning-text)]" role="status">
    <h3 className="font-medium">{t("exceptionsTitle")}</h3>
    {blocked.map(candidate => <div key={`${candidate.sourceId}-${candidate.month}`} className="space-y-2">
      <p>{candidate.label} · {formatDateOnly(candidate.from, locale)} – {formatDateOnly(candidate.to, locale)} · {t(`errors.${candidate.issue}`)}</p>
      {candidate.issue === "history_protected" ? <FinanceActionForm action={reviewAutomaticExpense} label={t("approveExpense")} onSaved={() => router.refresh()}>
        <input type="hidden" name="sourceId" value={candidate.sourceId}/><input type="hidden" name="month" value={candidate.month}/><input type="hidden" name="digest" value={candidate.digest}/><input type="hidden" name="confirmed" value="true"/>
        <p>{t("netCost", { amount: candidate.amount ?? "—", currency: candidate.currency ?? "" })}</p><p className="text-xs">{t("approveReviewed")}</p>
      </FinanceActionForm> : null}
    </div>)}
    {data.missingFx.length ? <p>{t("missingFx")} <Link href="/finance/reports#fx-history" className="underline">{t("openHistory")}</Link></p> : null}
  </div>;
}
