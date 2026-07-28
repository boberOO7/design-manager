import { AdministrationWorkspace } from "@/components/administration/administration-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getAdministrationData } from "@/data/queries/administration";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Administration | StudioFlow",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  const data = await getAdministrationData();
  if (!data) redirect("/dashboard");
  const params = await searchParams;
  const requestId = typeof params.request === "string" ? params.request : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Administration" description="Time-off decisions, upcoming availability, and studio access." />
      <AdministrationWorkspace initialData={data} requestId={requestId} />
    </div>
  );
}
