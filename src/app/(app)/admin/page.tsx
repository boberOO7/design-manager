import { AdministrationWorkspace } from "@/components/administration/administration-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getAdministrationData } from "@/data/queries/administration";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Administration | StudioFlow",
};

export default async function AdminPage() {
  const data = await getAdministrationData();
  if (!data) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader title="Administration" description="Time-off decisions, upcoming availability, and studio access." />
      <AdministrationWorkspace initialData={data} />
    </div>
  );
}
