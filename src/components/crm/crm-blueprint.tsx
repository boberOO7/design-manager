"use client";

import { useTranslations } from "next-intl";
import { CrmShell } from "@/components/crm/crm-shell";
import { CandidatesToolbar, CrmAddButton, CrmTableHead, LeadsToolbar, type CrmSection } from "@/components/crm/crm-list-presentation";
import { PROFESSIONAL_ROLES } from "@/lib/validation/employee-invitation";

export function CrmListBlueprint({ section = "leads" }: { section?: CrmSection }) {
  const common = useTranslations("Common");
  const t = useTranslations("Crm");
  return <div className="instaload-blueprint rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
    {section === "leads" ? <LeadsToolbar loading /> : <CandidatesToolbar loading positions={PROFESSIONAL_ROLES} />}
    <span role="status" className="sr-only">{common("loading")}</span>
    <table role="table" aria-label={t(`${section}.title`)} aria-busy="true" className="block w-full text-left text-sm lg:table lg:table-fixed">
      <CrmTableHead section={section} />
      <tbody role="rowgroup" className="block divide-y divide-[var(--ui-border)] lg:table-row-group">
        {Array.from({ length: 4 }, (_, index) => <tr key={index} aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-4 lg:table-row lg:p-0">
          <td className="col-span-2 min-w-0 lg:px-4 lg:py-4"><div className="flex h-10 flex-col justify-center gap-2"><span className="instaload-mark h-3 w-32 max-w-full" /><span className="instaload-mark h-2 w-28 max-w-full" /></div></td>
          <td className="col-span-2 row-start-2 min-w-0 lg:px-4 lg:py-4"><span className="instaload-mark h-3 w-24 max-w-full" /></td>
          <td className="col-span-2 row-start-3 min-w-0 sm:col-span-1 lg:px-4 lg:py-4"><div className="flex h-12 flex-col justify-center gap-3"><span className="instaload-mark h-3 w-36 max-w-full" /><span className="instaload-mark h-2 w-24 max-w-full" /></div></td>
          <td className="col-span-2 row-start-4 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-3 lg:px-4 lg:py-4"><span className="instaload-mark h-3 w-24 max-w-full" /></td>
          {section === "leads" ? <td className="hidden lg:table-cell" /> : null}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

export function CrmBlueprint({ section = "leads" }: { section?: CrmSection }) {
  return <CrmShell action={<CrmAddButton section={section} />}><CrmListBlueprint section={section} /></CrmShell>;
}
