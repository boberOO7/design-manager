import type { Metadata } from "next";
import { ContractorDirectory } from "@/components/contractors/contractor-directory";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getContractors } from "@/data/queries/contractors";

export const metadata: Metadata = { title: "Підрядники | StudioFlow" };

export default async function ContractorsPage() {
  const [{ contractors, error }, adminMembership] = await Promise.all([getContractors(), getActiveStudioAdmin()]);
  return <div className="space-y-8"><PageHeader title="Підрядники" description="Спільний довідник перевірених контактів студії." />{error ? <EmptyState title="Не вдалося завантажити підрядників" description="Оновіть сторінку або спробуйте ще раз пізніше." /> : <ContractorDirectory contractors={contractors} isAdmin={Boolean(adminMembership)} />}</div>;
}
