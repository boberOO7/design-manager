import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LeadsWorkspace } from "@/components/crm/leads-workspace";
import { InstaLoadReady } from "@/components/shared/instaload-motion";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getCrmAdmins, getCrmLeads } from "@/data/queries/crm";
import { getActiveStudioAssignees } from "@/data/queries/project-members";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";
import { getKyivDateOnly } from "@/lib/validation/project";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Crm.leads");
  return { title: t("metadata") };
}

export default async function CrmLeadsPage({ searchParams }: { searchParams: Promise<{ attention?: string | string[]; lead?: string | string[] }> }) {
  const pendingAdmins = getCrmAdmins();
  const pending = Promise.all([getCrmLeads(pendingAdmins), pendingAdmins]);
  const projectOptions = Promise.all([getActiveStudioAssignees(), getStudioProjectTemplates()]).then(([members, templates]) => ({ members, templates }));
  void pending.catch(() => {});
  void projectOptions.catch(() => {});
  const [[result, admins], params, t] = await Promise.all([pending, searchParams, getTranslations("Crm")]);
  const initialLeadId = typeof params.lead === "string" ? params.lead : undefined;
  return <div className="space-y-6"><PageHeader title={t("leads.title")} description={t("leads.description")} /><InstaLoadReady name="crm-leads" className="instaload-panel [--instaload-reveal-duration:200ms]">{result.error ? <EmptyState title={t("errors.loadTitle")} description={t("errors.loadDescription")} /> : <LeadsWorkspace leads={result.leads} admins={admins} currentUserId={result.currentUserId} defaultStartDate={getKyivDateOnly()} initialAttentionOnly={params.attention === "1"} initialLeadId={initialLeadId} projectOptions={projectOptions} />}</InstaLoadReady></div>;
}
