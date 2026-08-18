import type { Metadata } from "next";
import { ContractorDirectory } from "@/components/contractors/contractor-directory";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getContractors } from "@/data/queries/contractors";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Contractors");
  return { title: t("metadata") };
}

export default async function ContractorsPage() {
  const [{ categories, contractors, error }, membership, adminMembership, t] = await Promise.all([getContractors(), getActiveStudioMembership(), getActiveStudioAdmin(), getTranslations("Contractors")]);
  return <div className="space-y-8"><PageHeader title={t("title")} description={t("description")} />{error ? <EmptyState title={t("errors.loadTitle")} description={t("errors.loadDescription")} /> : <ContractorDirectory categories={categories} contractors={contractors} canEdit={Boolean(membership)} isAdmin={Boolean(adminMembership)} />}</div>;
}
