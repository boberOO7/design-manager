import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { ChecklistTemplateManager } from "@/components/administration/checklist-template-manager";
import { getStudioChecklistTemplates } from "@/data/queries/checklist-templates";
import { ProjectTemplateManager } from "@/components/projects/project-template-manager";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";

export default async function ProjectTemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const membership = await getActiveStudioAdmin();
  if (!membership) redirect("/projects");
  const [templates, checklistTemplates] = await Promise.all([getStudioProjectTemplates(), getStudioChecklistTemplates({ includeArchived: true })]);
  const params = await searchParams;
  const tab = params.tab === "checklists" ? "checklists" : "projects";
  const preservedParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "tab" || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) preservedParams.append(key, entry);
  }
  const projectParams = new URLSearchParams(preservedParams);
  const checklistParams = new URLSearchParams(preservedParams);
  checklistParams.set("tab", "checklists");
  const projectHref = projectParams.toString() ? `/projects/templates?${projectParams}` : "/projects/templates";
  const checklistHref = `/projects/templates?${checklistParams}`;
  return <div className="space-y-4"><div className="flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--ui-border)] pb-2"><div className="flex items-center gap-3"><Link href="/projects" className="inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ArrowLeft className="size-4" aria-hidden="true" />Проєкти</Link><span aria-hidden="true" className="h-5 border-l border-[var(--ui-border)]" /><h1 className="text-2xl font-semibold text-[var(--ui-text)]">Шаблони</h1></div><nav aria-label="Тип шаблонів" className="relative ml-auto grid shrink-0 grid-cols-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1"><span aria-hidden="true" className="pointer-events-none absolute inset-x-1 inset-y-1"><span className={`block h-full w-1/2 rounded-[calc(var(--ui-radius-control)-2px)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] transition-transform duration-200 ease-out motion-reduce:transition-none ${tab === "checklists" ? "translate-x-full" : "translate-x-0"}`} /></span><Link href={projectHref} replace aria-current={tab === "projects" ? "page" : undefined} className="relative z-10 flex min-h-8 items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:text-[var(--ui-text)]">Проєктів</Link><Link href={checklistHref} replace aria-current={tab === "checklists" ? "page" : undefined} className="relative z-10 flex min-h-8 items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:text-[var(--ui-text)]">Чеклістів</Link></nav></div>{tab === "projects" ? <ProjectTemplateManager studioId={membership.studio_id} initialTemplates={templates} checklistTemplates={checklistTemplates} /> : <ChecklistTemplateManager studioId={membership.studio_id} templates={checklistTemplates} />}</div>;
}
