"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { saveFinanceManagement } from "@/app/(app)/finance/reports/actions";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { FinanceActionForm } from "./finance-action-form";
import { formatDateOnly } from "@/lib/utils";
import { earningExceptionKey } from "@/lib/finance-earnings";
import type { FinanceMonth } from "@/lib/finance-month-reporting";

export function ManagementMonthStatus({ month, onSaved, missingDisplayFx = false, sourceLabels = {} }: { month: FinanceMonth; onSaved: () => void; missingDisplayFx?: boolean; sourceLabels?: Record<string, string> }) {
  const t = useTranslations("Finance.management.monthClose"), locale = useLocale();
  const labor = useTranslations("Finance.labor.auto.issue"), expenses = useTranslations("Finance.expenses.errors"), earnings = useTranslations("Finance.earnings.errors");
  const [approved, setApproved] = useState(false);
  const status = missingDisplayFx ? "needs_review" : month.status;
  const reason = (code: string) => t.has(`reason.${code}`) ? t(`reason.${code}`) : labor.has(code) ? labor(code) : expenses.has(code) ? expenses(code) : code.startsWith("finance_earning_") ? earnings(earningExceptionKey(code)) : earnings.has(code) ? earnings(code) : t("processingException", { code });
  return <div data-testid="management-month-status" className="space-y-2 border-b border-[var(--ui-border-subtle)] py-3 last:border-0">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{formatDateOnly(month.month, locale)}</p><span data-testid="month-status" className={status === "needs_review" ? "text-[var(--ui-warning-text)]" : "text-[var(--ui-text-secondary)]"}>{t(`status.${status}`)}</span></div>
    {month.changed ? <p role="status" className="text-xs text-[var(--ui-warning-text)]">{t("changed")}</p> : null}
    <AnimatedDisclosure title={t("details")}>
      <div className="space-y-3 py-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">{Object.entries(month.categories).map(([category, state]) => <div key={category} className="contents"><dt>{t(`category.${category}`)}</dt><dd>{t(`sourceState.${state}`)}</dd></div>)}</dl>
        {month.exceptions.length ? <ul className="space-y-2 text-xs text-[var(--ui-warning-text)]">{month.exceptions.map((issue, index) => <li key={`${issue.sourceId}-${issue.reason}-${index}`}><Link href={issue.href} className="underline underline-offset-2">{sourceLabels[issue.sourceId] ?? issue.label}</Link> · {reason(issue.reason)}<span className="block text-[var(--ui-text-muted)]">{t("source", { id: issue.sourceId })}</span></li>)}</ul> : null}
        {missingDisplayFx ? <Link href="#fx-history" className="text-xs text-[var(--ui-warning-text)] underline">{t("displayFx")}</Link> : null}
        {month.status !== "confirmed" && month.closed && !month.exceptions.length ? <FinanceActionForm action={saveFinanceManagement} label={t("confirm")} disabled={!approved || missingDisplayFx} onSaved={onSaved}>
          <input type="hidden" name="intent" value="month"/><input type="hidden" name="month" value={month.month}/><input type="hidden" name="digest" value={month.digest}/><input type="hidden" name="revision" value={month.revision}/>
          {approved ? <input type="hidden" name="approved" value="true"/> : null}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} className="mt-1" required/><span>{t("approval")}</span></label>
        </FinanceActionForm> : null}
        {!month.closed ? <p className="text-xs text-[var(--ui-text-secondary)]">{t("open")}</p> : null}
      </div>
    </AnimatedDisclosure>
  </div>;
}
