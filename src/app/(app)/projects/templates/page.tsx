import { redirect } from "next/navigation";
import { ProjectTemplateManager } from "@/components/projects/project-template-manager";
import { PageHeader } from "@/components/shared/page-header";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";

export default async function ProjectTemplatesPage() {
  const membership = await getActiveStudioAdmin();
  if (!membership) redirect("/projects");
  const templates = await getStudioProjectTemplates();
  return <div className="space-y-6"><PageHeader title="Шаблони проєктів" description="Структура задач, що автоматично додається до нових проєктів." /><ProjectTemplateManager studioId={membership.studio_id} initialTemplates={templates} /></div>;
}
