import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CandidatesWorkspace } from "@/components/crm/candidates-workspace";
import { CrmShell } from "@/components/crm/crm-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getCrmAdmins, getCrmCandidates } from "@/data/queries/crm";
import { PROFESSIONAL_ROLES } from "@/lib/validation/employee-invitation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Crm.candidates");
  return { title: t("metadata") };
}

export default async function CrmCandidatesPage() {
  const [result, admins, t] = await Promise.all([getCrmCandidates(), getCrmAdmins(), getTranslations("Crm")]);
  return result.error ? <CrmShell><EmptyState title={t("errors.loadTitle")} description={t("errors.loadDescription")} /></CrmShell> : <CandidatesWorkspace candidates={result.candidates} admins={admins} positions={PROFESSIONAL_ROLES} />;
}
