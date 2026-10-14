import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/page-header";

export function CrmListBlueprint() {
  const common = useTranslations("Common");
  const t = useTranslations("Crm");
  const columns = ["contact", "request", "status", "responsible", "followUp"];
  return <div role="status" aria-label={common("loading")} className="instaload-blueprint rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
    <span className="sr-only">{common("loading")}</span>
    <div aria-hidden="true">
      <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] p-4 md:flex-row md:items-center">
        <span className="instaload-mark h-11 min-w-0 flex-1" />
        <span className="instaload-mark h-10 md:w-44" />
        <span className="instaload-mark h-11 md:w-52" />
        <span className="instaload-mark flex h-10 items-center justify-center px-4 text-sm font-semibold">{t("leads.add")}</span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-xs uppercase tracking-wide text-[var(--ui-text-muted)]"><tr>{columns.map(column => <th key={column} className="px-4 py-3">{t(`leads.columns.${column}`)}</th>)}<th className="px-4 py-3"><span className="sr-only">{t("recordActions")}</span></th></tr></thead>
        <tbody className="divide-y divide-[var(--ui-border)]">{Array.from({ length: 6 }, (_, index) => <tr key={index}>
          <td className="px-4 py-3"><span className="flex h-9 flex-col justify-center gap-2"><span className="instaload-mark h-3 w-36" /><span className="instaload-mark h-2 w-28" /></span></td>
          {columns.slice(1).map(column => <td key={column} className="px-4 py-3"><span className={`instaload-mark ${column === "status" ? "h-6 w-16 rounded-full" : "h-3 w-24"}`} /></td>)}
          <td className="px-4 py-3"><span className="instaload-mark ml-auto h-11 w-28" /></td>
        </tr>)}</tbody>
      </table></div>
    </div>
  </div>;
}

export function CrmBlueprint() {
  const t = useTranslations("Crm");
  return <div className="space-y-6"><PageHeader title={t("leads.title")} description={t("leads.description")} /><CrmListBlueprint /></div>;
}
