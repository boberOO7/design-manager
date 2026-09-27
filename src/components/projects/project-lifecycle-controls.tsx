"use client";

import { Check, MoreHorizontal, Pause, Play, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useTranslations } from "next-intl";
import styles from "./project-context-band.module.css";
import { isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { useProjectLifecycle } from "@/components/projects/project-lifecycle-context";

export function ProjectLifecycleControls({ projectId, children }: { projectId: string; children?: ReactNode }) {
  const t = useTranslations("ProjectWorkspace");
  const { status, setStatus } = useProjectLifecycle();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions: Record<ProjectLifecycleStatus, Array<{ status: ProjectLifecycleStatus; label: string; icon: typeof Play }>> = {
    planned: [{ status: "active", label: t("startProject"), icon: Play }], active: [{ status: "paused", label: t("pauseProject"), icon: Pause }, { status: "completed", label: t("completeProject"), icon: Check }], paused: [{ status: "active", label: t("resumeProject"), icon: Play }, { status: "completed", label: t("completeProject"), icon: Check }], completed: [{ status: "active", label: t("reopenProject"), icon: RotateCcw }], archived: [],
  };
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
  return <PopoverPrimitive.Root>
    <PopoverPrimitive.Trigger asChild><button type="button" aria-label={t("moreActions")} title={t("moreActions")} className={styles.iconAction}><MoreHorizontal className="size-4" aria-hidden="true" /></button></PopoverPrimitive.Trigger>
    <PopoverPrimitive.Portal><PopoverPrimitive.Content align="end" sideOffset={8} collisionPadding={16} aria-label={t("moreActions")} className={styles.actionMenu}>
    {actions[status].map((action) => <button key={action.status} type="button" className={styles.menuAction} disabled={pending} onClick={() => void updateStatus(action.status)}><action.icon className="size-4" aria-hidden="true" />{action.label}</button>)}
    {status === "paused" ? <button type="button" disabled={pending} onClick={() => void updateStatus("planned")} className={styles.menuAction}><RotateCcw className="size-4" aria-hidden="true" />{t("returnToPlanned")}</button> : null}
    {pending ? <p role="status" className="px-3 py-2 text-xs text-[var(--ui-text-muted)]">{t("saving")}</p> : null}
    {error ? <p role="alert" className="px-3 py-2 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    {children}
    </PopoverPrimitive.Content></PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}
