import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChecklistTemplateManager } from "@/components/administration/checklist-template-manager";
import { getStudioChecklistTemplates } from "@/data/queries/checklist-templates";
import { ProjectTemplateManager } from "@/components/projects/project-template-manager";
import { WorkDirectionPresetSettings } from "@/components/projects/work-direction-preset-settings";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getStudioProjectTemplates } from "@/data/queries/project-templates";
import { getStudioDirectionPresets } from "@/data/queries/work-direction-presets";

export default async function ProjectTemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const membership = await getActiveStudioAdmin();
  if (!membership) redirect("/projects");
  const params = await searchParams;
  const tab = params.tab === "checklists" ? "checklists" : params.tab === "directions" ? "directions" : "projects";
  const [templates, checklistTemplates, presets, t, workspace] = await Promise.all([getStudioProjectTemplates(), tab !== "directions" ? getStudioChecklistTemplates({ includeArchived: true }) : Promise.resolve([]), tab === "directions" ? getStudioDirectionPresets() : Promise.resolve([]), getTranslations("ProjectWorkspace.directions"), getTranslations("Workspace")]);
  const preservedParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "tab" || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) preservedParams.append(key, entry);
  }
  const tabs = [{ id: "projects", label: t("projectTemplatesTab") }, { id: "checklists", label: t("checklistsTab") }, { id: "directions", label: t("presetsTab") }];
  return <div className="space-y-4"><div className="flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--ui-border)] pb-2"><div className="flex items-center gap-3"><Link href="/projects" className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ui-radius-control)] text-sm font-semibold text-[var(--ui-text-secondary)] transition-colors hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ArrowLeft className="size-4" aria-hidden="true"/>{workspace("backToProjects")}</Link><span aria-hidden="true" className="h-5 border-l border-[var(--ui-border)]"/><h1 className="text-2xl font-semibold">{t("templatesTitle")}</h1></div><nav aria-label={t("templatesTitle")} className="flex max-w-full flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{tabs.map(item => {
    const query = new URLSearchParams(preservedParams); if (item.id !== "projects") query.set("tab", item.id);
    return <Link key={item.id} href={`/projects/templates${query.size ? `?${query}` : ""}`} scroll={false} aria-current={tab === item.id ? "page" : undefined} className="inline-flex min-h-10 items-center justify-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:bg-[var(--ui-surface)] aria-[current=page]:text-[var(--ui-text)] motion-reduce:transition-none">{item.label}</Link>;
  })}</nav></div>{tab === "projects" ? <ProjectTemplateManager studioId={membership.studio_id} initialTemplates={templates} checklistTemplates={checklistTemplates}/> : tab === "directions" ? <WorkDirectionPresetSettings presets={presets} templates={templates}/> : <ChecklistTemplateManager studioId={membership.studio_id} templates={checklistTemplates}/>}</div>;
}
