import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { ChecklistTemplateManager } from "@/components/administration/checklist-template-manager";
import { getStudioChecklistTemplates } from "@/data/queries/checklist-templates";
import { ProjectTemplateManager } from "@/components/projects/project-template-manager";
import { PageHeader } from "@/components/shared/page-header";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";

export default async function ProjectTemplatesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const membership = await getActiveStudioAdmin();
  if (!membership) redirect("/projects");
  const [templates, checklistTemplates] = await Promise.all([getStudioProjectTemplates(), getStudioChecklistTemplates({ includeArchived: true })]);
  const tab = (await searchParams).tab === "checklists" ? "checklists" : "projects";
  return <div className="space-y-6"><div className="space-y-2"><Link href="/projects" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ArrowLeft className="size-4" aria-hidden="true" />Проєкти</Link><PageHeader title="Шаблони" description="Шаблони проєктів і чеклістів студії." /></div><nav aria-label="Тип шаблонів" className="flex gap-2 border-b border-[var(--ui-border)] pb-3"><Link href="/projects/templates" aria-current={tab === "projects" ? "page" : undefined} className={`rounded-[var(--ui-radius-control)] px-4 py-2 text-sm font-semibold ${tab === "projects" ? "bg-[var(--ui-text)] text-[var(--ui-surface)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]"}`}>Шаблони проєктів</Link><Link href="/projects/templates?tab=checklists" aria-current={tab === "checklists" ? "page" : undefined} className={`rounded-[var(--ui-radius-control)] px-4 py-2 text-sm font-semibold ${tab === "checklists" ? "bg-[var(--ui-text)] text-[var(--ui-surface)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]"}`}>Шаблони чеклістів</Link></nav>{tab === "projects" ? <ProjectTemplateManager studioId={membership.studio_id} initialTemplates={templates} checklistTemplates={checklistTemplates} /> : <ChecklistTemplateManager studioId={membership.studio_id} templates={checklistTemplates} />}</div>;
}
