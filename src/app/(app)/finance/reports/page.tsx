import { ProjectsReportsWorkspace } from "@/components/finance/project-profitability-section";
import { redirect } from "next/navigation";
import { getFinanceManagement } from "@/data/queries/finance-management";
import { ManagementReportsWorkspace } from "@/components/finance/management-reports-workspace";

export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = await getFinanceManagement(await searchParams);
  if (!data) redirect("/dashboard");
  if (data.filters.mode === "projects") return <ProjectsReportsWorkspace key={data.version} data={data}/>;
  return <ManagementReportsWorkspace key={data.version} data={data} />;
}
