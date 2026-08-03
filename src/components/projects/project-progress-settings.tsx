"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { calculateProjectProgress, isProjectProgressMethod, type ProjectProgressMethod } from "@/lib/project-progress";
import type { ProjectTask } from "@/types/tasks";

export function ProjectProgressSettings({ canManage, isReadOnly, project, tasks }: {
  canManage: boolean;
  isReadOnly: boolean;
  project: { id: string; name: string; progress_method: string; total_area_m2: number };
  tasks: ProjectTask[];
}) {
  const t = useTranslations("Workspace");
  const common = useTranslations("Common");
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
        throw new Error(t("methodSaveFailed"));
      }
      setMessage(t("methodSaved"));
      router.refresh();
    } catch (cause) {
      setMethod(initialMethod);
      setError(cause instanceof Error ? cause.message : t("methodSaveFailed"));
    } finally { setIsSaving(false); }
  }

  return <section aria-labelledby="progress-method-heading" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-4 shadow-[var(--ui-shadow-panel)]">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)] lg:items-end">
      <div><h2 id="progress-method-heading" className="font-semibold text-[var(--ui-text)]">{t("progressMethod")}</h2><p className="mt-1 text-sm leading-6 text-[var(--ui-text-secondary)]">{t(`${method}Description`)}</p>{method === "area" ? <p className="ui-numeric mt-2 text-sm font-medium text-[var(--ui-text)]">{t("areaCoverage", { assigned: progress.assignedAreaM2, total: project.total_area_m2 })}{progress.unweightedTaskCount > 0 ? ` · ${t("tasksWithoutArea", { count: progress.unweightedTaskCount })}` : ""}</p> : method === "weighted" ? <p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("editTaskWeight")}</p> : null}</div>
      {canManage && !isReadOnly ? <div className="flex flex-col gap-2 sm:flex-row lg:justify-end"><label className="grid min-w-52 gap-1 text-xs font-medium text-[var(--ui-text-muted)]">{t("aggregation")}
        <Select value={method} disabled={isSaving} onValueChange={(nextMethod) => { if (isProjectProgressMethod(nextMethod)) { setMethod(nextMethod); setMessage(null); setError(null); } }}><SelectItem value="equal">{t("equal")}</SelectItem><SelectItem value="area">{t("area")}</SelectItem><SelectItem value="weighted">{t("weighted")}</SelectItem></Select>
      </label><Button type="button" className="min-h-11 self-end" disabled={isSaving || method === initialMethod} onClick={() => void save()}>{isSaving ? common("loading") : t("saveMethod")}</Button></div> : null}
    </div>
    {message ? <p role="status" className="mt-3 text-sm text-[var(--ui-success-text)]">{message}</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
  </section>;
}
