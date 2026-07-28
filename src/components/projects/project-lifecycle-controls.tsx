"use client";

import { Check, MoreHorizontal, Pause, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";

const actions: Record<ProjectLifecycleStatus, Array<{ status: ProjectLifecycleStatus; label: string; icon: typeof Play; confirm?: string }>> = {
  planned: [{ status: "active", label: "Start project", icon: Play }],
  active: [{ status: "paused", label: "Pause project", icon: Pause }, { status: "completed", label: "Complete project", icon: Check, confirm: "Complete this project? All remaining tasks must already be completed or cancelled." }],
  paused: [{ status: "active", label: "Resume project", icon: Play }, { status: "completed", label: "Complete project", icon: Check, confirm: "Complete this project? All remaining tasks must already be completed or cancelled." }],
  completed: [{ status: "active", label: "Reopen project", icon: RotateCcw, confirm: "Reopen this project? Tasks can be changed again." }],
  archived: [],
};

export function ProjectLifecycleControls({ projectId }: { projectId: string }) {
  const { status, setStatus } = useProjectLifecycle();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primary = actions[status][0];
  const secondary = actions[status][1];
  async function updateStatus(nextStatus: ProjectLifecycleStatus, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    const previous = status;
    setStatus(nextStatus);
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof result !== "object" || result === null || !("success" in result) || result.success !== true || !("status" in result) || typeof result.status !== "string") throw new Error(typeof result === "object" && result !== null && "formError" in result && typeof result.formError === "string" ? result.formError : "The project lifecycle could not be updated. Please try again.");
      if (!isProjectLifecycleStatus(result.status)) throw new Error("The project lifecycle could not be updated. Please try again.");
      setStatus(result.status);
    } catch (cause) {
      setStatus(previous);
      setError(cause instanceof Error ? cause.message : "The project lifecycle could not be updated. Please try again.");
    } finally { setPending(false); }
  }
  if (!primary) return null;
  const PrimaryIcon = primary.icon;
  return <div className="flex flex-wrap items-center justify-end gap-2">
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void updateStatus(primary.status, primary.confirm)} aria-label={primary.label}><PrimaryIcon className="size-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">{pending ? "Saving…" : primary.label}</span></Button>
    {secondary ? (() => { const SecondaryIcon = secondary.icon; return <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void updateStatus(secondary.status, secondary.confirm)} aria-label={secondary.label}><SecondaryIcon className="size-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">{secondary.label}</span></Button>; })() : null}
    {status === "paused" ? <details className="relative"><summary aria-label="More project actions" className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-stone-200 text-stone-700"><MoreHorizontal className="size-4" /></summary><div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-stone-200 bg-white p-1 shadow-lg"><button type="button" disabled={pending} onClick={() => void updateStatus("planned")} className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50">Return to planned</button></div></details> : null}
    {error ? <p role="alert" className="basis-full text-right text-sm text-red-700">{error}</p> : null}
  </div>;
}
