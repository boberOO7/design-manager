"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { calculateProjectProgress, isProjectProgressMethod, type ProjectProgressMethod } from "@/lib/project-progress";
import type { ProjectTask } from "@/types/tasks";

const descriptions: Record<ProjectProgressMethod, string> = {
  equal: "Every non-cancelled task contributes equally.",
  area: "Task area is measured against the full project design scope; unallocated area remains unfinished.",
  weighted: "Each task uses its explicit progress weight; task area is ignored for aggregation.",
};

export function ProjectProgressSettings({ canManage, isReadOnly, project, tasks }: {
  canManage: boolean;
  isReadOnly: boolean;
  project: { id: string; name: string; progress_method: string; total_area_m2: number };
  tasks: ProjectTask[];
}) {
  const router = useRouter();
  const initialMethod = isProjectProgressMethod(project.progress_method) ? project.progress_method : "equal";
  const [method, setMethod] = useState<ProjectProgressMethod>(initialMethod);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = calculateProjectProgress(tasks, undefined, { method, designScopeAreaM2: Number(project.total_area_m2) });

  async function save() {
    setIsSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/progress`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ progress_method: method }) });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || result.success !== true) {
        const formError = typeof result === "object" && result !== null && "formError" in result && typeof result.formError === "string" ? result.formError : "The progress method could not be saved.";
        throw new Error(formError);
      }
      setMessage("Project progress method saved.");
      router.refresh();
    } catch (cause) {
      setMethod(initialMethod);
      setError(cause instanceof Error ? cause.message : "The progress method could not be saved.");
    } finally { setIsSaving(false); }
  }

  return <section aria-labelledby="progress-method-heading" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-4 shadow-[var(--ui-shadow-panel)]">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)] lg:items-end">
      <div><h2 id="progress-method-heading" className="font-semibold text-[var(--ui-text)]">Progress method</h2><p className="mt-1 text-sm leading-6 text-[var(--ui-text-secondary)]">{descriptions[method]}</p>{method === "area" ? <p className="ui-numeric mt-2 text-sm font-medium text-[var(--ui-text)]">Area coverage: {progress.assignedAreaM2} / {project.total_area_m2} m²{progress.unweightedTaskCount > 0 ? ` · ${progress.unweightedTaskCount} task${progress.unweightedTaskCount === 1 ? "" : "s"} without area` : ""}</p> : method === "weighted" ? <p className="mt-2 text-sm text-[var(--ui-text-muted)]">Edit each task’s weight in its details drawer.</p> : null}</div>
      {canManage && !isReadOnly ? <div className="flex flex-col gap-2 sm:flex-row lg:justify-end"><label className="grid min-w-52 gap-1 text-xs font-medium text-[var(--ui-text-muted)]">Aggregation
        <select value={method} disabled={isSaving} onChange={(event) => { if (isProjectProgressMethod(event.target.value)) { setMethod(event.target.value); setMessage(null); setError(null); } }} className="min-h-11 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><option value="equal">Equal</option><option value="area">Area</option><option value="weighted">Weighted</option></select>
      </label><Button type="button" className="min-h-11 self-end" disabled={isSaving || method === initialMethod} onClick={() => void save()}>{isSaving ? "Saving…" : "Save method"}</Button></div> : null}
    </div>
    {message ? <p role="status" className="mt-3 text-sm text-[var(--ui-success-text)]">{message}</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
  </section>;
}
