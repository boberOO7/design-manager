import { AdministrationWorkspace } from "@/components/administration/administration-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getAdministrationData } from "@/data/queries/administration";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Administration | StudioFlow",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  const t = await getTranslations("Administration");
  const data = await getAdministrationData();
  if (!data) redirect("/dashboard");
  const params = await searchParams;
  const requestId = typeof params.request === "string" ? params.request : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("pageDescription")} />
      <AdministrationWorkspace initialData={data} requestId={requestId} />
    </div>
  );
}
