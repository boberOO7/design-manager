import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CandidatesWorkspace } from "@/components/crm/candidates-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getCrmAdmins, getCrmCandidates } from "@/data/queries/crm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Crm.candidates");
  return { title: t("metadata") };
}

export default async function CrmCandidatesPage() {
  const [result, admins, t] = await Promise.all([getCrmCandidates(), getCrmAdmins(), getTranslations("Crm")]);
  return <div className="space-y-6"><PageHeader title={t("candidates.title")} description={t("candidates.description")} />{result.error ? <EmptyState title={t("errors.loadTitle")} description={t("errors.loadDescription")} /> : <CandidatesWorkspace candidates={result.candidates} admins={admins} />}</div>;
}
