import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { ProjectTemplateManager } from "@/components/projects/project-template-manager";
import { PageHeader } from "@/components/shared/page-header";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";

export default async function ProjectTemplatesPage() {
  const membership = await getActiveStudioAdmin();
  if (!membership) redirect("/projects");
  const templates = await getStudioProjectTemplates();
  return <div className="space-y-6"><div className="space-y-2"><Link href="/projects" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ArrowLeft className="size-4" aria-hidden="true" />Проєкти</Link><PageHeader title="Шаблони проєктів" description="Структура задач, що автоматично додається до нових проєктів." /></div><ProjectTemplateManager studioId={membership.studio_id} initialTemplates={templates} /></div>;
}
