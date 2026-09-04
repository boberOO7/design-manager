"use client";

import { Check, MoreHorizontal, Pause, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";

export function ProjectLifecycleControls({ projectId }: { projectId: string }) {
  const t = useTranslations("ProjectWorkspace");
  const { status, setStatus } = useProjectLifecycle();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions: Record<ProjectLifecycleStatus, Array<{ status: ProjectLifecycleStatus; label: string; icon: typeof Play }>> = {
    planned: [{ status: "active", label: t("startProject"), icon: Play }], active: [{ status: "paused", label: t("pauseProject"), icon: Pause }, { status: "completed", label: t("completeProject"), icon: Check }], paused: [{ status: "active", label: t("resumeProject"), icon: Play }, { status: "completed", label: t("completeProject"), icon: Check }], completed: [{ status: "active", label: t("reopenProject"), icon: RotateCcw }], archived: [],
  };
  const primary = actions[status][0]; const secondary = actions[status][1];
  async function updateStatus(nextStatus: ProjectLifecycleStatus) {
    const previous = status;
    setStatus(nextStatus);
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || result.success !== true || !("status" in result) || typeof result.status !== "string") throw new Error(t("lifecycleError"));
      if (!isProjectLifecycleStatus(result.status)) throw new Error(t("lifecycleError"));
      setStatus(result.status);
    } catch (cause) {
      setStatus(previous);
      setError(cause instanceof Error ? cause.message : t("lifecycleError"));
    } finally { setPending(false); }
  }
  if (!primary) return null;
  const PrimaryIcon = primary.icon;
  return <div className="flex flex-wrap items-center justify-end gap-2">
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void updateStatus(primary.status)} aria-label={primary.label}><PrimaryIcon className="size-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">{pending ? t("saving") : primary.label}</span></Button>
    {secondary ? (() => { const SecondaryIcon = secondary.icon; return <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void updateStatus(secondary.status)} aria-label={secondary.label}><SecondaryIcon className="size-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">{secondary.label}</span></Button>; })() : null}
    {status === "paused" ? <details className="relative"><summary aria-label={t("moreActions")} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--ui-border)] text-[var(--ui-text-secondary)]"><MoreHorizontal className="size-4" /></summary><div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-lg"><button type="button" disabled={pending} onClick={() => void updateStatus("planned")} className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] disabled:opacity-50">{t("returnToPlanned")}</button></div></details> : null}
    {error ? <p role="alert" className="basis-full text-right text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
  </div>;
}
