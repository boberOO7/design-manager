import { notFound } from "next/navigation";
import { getFinanceData, getFinancePlanning, getFinanceProject } from "@/data/queries/finance";
import { getKyivDateOnly } from "@/lib/validation/project";
import { projectStreams } from "@/lib/finance-projects";
import { ProjectFinanceWorkspace } from "./project-finance-workspace";

export async function ProjectFinanceSection({ projectId, query }: { projectId: string; query: Partial<Record<"stream" | "page" | "credits" | "filter", string | string[]>> }) {
  const pageNumber = (value: string | string[] | undefined) => typeof value === "string" && /^\d+$/.test(value) ? Math.max(1, Math.min(100_000, Number(value))) : 1;
  const page = pageNumber(query.page), creditPage = pageNumber(query.credits);
  const stream = projectStreams.find((v) => v === query.stream) ?? "design";
  const filter = "all";
  const [foundation, project, planning] = await Promise.all([getFinanceData(), getFinanceProject(projectId), getFinancePlanning(page, creditPage, filter, projectId, stream)]);
  if (!foundation || !project || !planning) notFound();
  return <ProjectFinanceWorkspace {...foundation} {...planning} project={project} stream={stream} today={getKyivDateOnly()} page={page} creditPage={creditPage} filter={filter}/>;
}
