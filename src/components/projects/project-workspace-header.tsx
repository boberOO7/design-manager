"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { ProjectLifecycleControls } from "@/components/projects/project-lifecycle-controls";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";
import { formatDateOnly } from "@/lib/utils";
import { getProjectLifecycleBadgeStyle } from "@/lib/semantic-styles";

function label(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }

export function ProjectWorkspaceHeader({ canManage, isArchived, project, archiveAction, restoreAction }: {
  canManage: boolean; isArchived: boolean; project: { id: string; name: string; project_code: string | null; client_name: string | null; status: string; priority: string; total_area_m2: number; start_date: string; due_date: string | null };
  archiveAction: (formData: FormData) => Promise<void>; restoreAction: (formData: FormData) => Promise<void>;
}) {
  const { status } = useProjectLifecycle();
  const lifecycle = getProjectLifecycleBadgeStyle(status);
  return <header className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><Link href="/projects" className="text-sm font-medium text-stone-500 transition hover:text-stone-900">← Projects</Link><div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="truncate text-2xl font-bold tracking-tight text-stone-900">{project.name}</h1>{project.project_code ? <span className="text-sm font-medium text-stone-400">{project.project_code}</span> : null}</div>{project.client_name ? <p className="mt-1 text-sm text-stone-500">{project.client_name}</p> : null}</div>{canManage ? <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">{isArchived ? <ProjectStatusAction action={restoreAction} label="Restore" pendingLabel="Restoring…" /> : <><ProjectLifecycleControls projectId={project.id} />{status !== "completed" ? <Button asChild size="sm" variant="outline"><Link href={`/projects/${project.id}/edit`}>Edit</Link></Button> : null}<details className="relative"><summary aria-label="More project actions" className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-stone-200 text-stone-700"><MoreHorizontal className="size-4" /></summary><div className="absolute right-0 z-20 mt-2 w-32 rounded-xl border border-stone-200 bg-white p-1 shadow-lg"><ProjectStatusAction action={archiveAction} confirmMessage={`Archive ${project.name}? You can restore it later.`} label="Archive" pendingLabel="Archiving…" /></div></details></>}</div> : null}</div><dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-100 pt-4 text-sm"><div className="flex items-center gap-1.5"><dt className="text-stone-400">Status</dt><dd><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lifecycle.className}`}>{lifecycle.label}</span></dd></div><div className="flex gap-1.5"><dt className="text-stone-400">Priority</dt><dd className="font-medium text-stone-700">{label(project.priority)}</dd></div><div className="flex gap-1.5"><dt className="text-stone-400">Area</dt><dd className="font-medium text-stone-700">{project.total_area_m2} m²</dd></div><div className="flex gap-1.5"><dt className="text-stone-400">Start</dt><dd className="font-medium text-stone-700">{formatDateOnly(project.start_date)}</dd></div><div className="flex gap-1.5"><dt className="text-stone-400">Due</dt><dd className="font-medium text-stone-700">{formatDateOnly(project.due_date)}</dd></div></dl></header>;
}
