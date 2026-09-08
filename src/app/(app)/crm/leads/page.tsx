import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LeadsWorkspace } from "@/components/crm/leads-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getCrmAdmins, getCrmLeads } from "@/data/queries/crm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Crm.leads");
  return { title: t("metadata") };
}

export default async function CrmLeadsPage() {
  const [result, admins, t] = await Promise.all([getCrmLeads(), getCrmAdmins(), getTranslations("Crm")]);
  return <div className="space-y-6"><PageHeader title={t("leads.title")} description={t("leads.description")} />{result.error ? <EmptyState title={t("errors.loadTitle")} description={t("errors.loadDescription")} /> : <LeadsWorkspace leads={result.leads} admins={admins} />}</div>;
}
