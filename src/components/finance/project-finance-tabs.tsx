"use client";

import { ProjectWorkspaceLink } from "@/components/projects/project-workspace-navigation";
import type { ProjectFinanceTab } from "@/lib/finance-project-view";

export function ProjectFinanceTabs({ projectId, directionId, tab, stream = "design", labels }: {
  projectId: string; directionId?: string | null; tab: ProjectFinanceTab; stream?: string;
  labels: { label: string; tabs: Record<ProjectFinanceTab, string> };
}) {
  return <nav aria-label={labels.label} className="flex gap-1 border-b border-[var(--ui-border)]">
    {(["payments", "expenses", "result"] as const).map(value => <ProjectWorkspaceLink key={value} href={`/projects/${projectId}?view=finance&workDirection=${directionId ?? "all"}&financeTab=${value}${value === "payments" ? `&stream=${directionId || stream === "expenses" ? "design" : stream}` : ""}`} scroll={false} aria-current={value === tab ? "page" : undefined} className="flex min-h-11 flex-1 items-center justify-center border-b-2 border-transparent px-4 py-2 text-sm font-medium text-[var(--ui-text-secondary)] transition-colors duration-200 hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] aria-[current=page]:border-[var(--ui-text)] aria-[current=page]:text-[var(--ui-text)] motion-reduce:transition-none sm:flex-none">{labels.tabs[value]}</ProjectWorkspaceLink>)}
  </nav>;
}
