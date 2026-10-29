"use client";

import { useState, useTransition } from "react";
import { useProjectWorkspaceRouter as useRouter } from "@/components/projects/project-workspace-navigation";
import { useTranslations } from "next-intl";
import { saveOrderDirections } from "@/app/(app)/projects/[projectId]/direction-actions";
import { AnimatedDisclosure } from "@/components/ui/animated-form-content";
import { Button } from "@/components/ui/button";
import type { FinanceProjectData } from "@/data/queries/finance";

export function OrderWorkDirections({ project, orderId, onPending }: { project: FinanceProjectData; orderId: string; onPending: (value: boolean) => void }) {
  const t = useTranslations("Finance.orders"), router = useRouter();
  const directionLabels = useTranslations("Finance.directionWorkspace.kinds");
  const initial = project.directionLinks.filter(link => link.order_id === orderId).map(link => link.direction_id);
  const [selected, setSelected] = useState(initial), [message, setMessage] = useState<string | null>(null), [pending, startTransition] = useTransition();
  const dirty = selected.length !== initial.length || selected.some(id => !initial.includes(id));
  function save() {
    setMessage(null); onPending(true);
    startTransition(async () => {
      try {
        const result = await saveOrderDirections(project.projectId, orderId, selected, project.directionVersion);
        if (!result.success) { setMessage(t(result.error === "conflict" ? "directionsConflict" : result.error === "milestones" ? "directionsMilestones" : "directionsFailed")); return; }
        setMessage(t("directionsSaved")); router.refresh();
      } catch { setMessage(t("directionsFailed")); }
      finally { onPending(false); }
    });
  }
  return <AnimatedDisclosure title={t("workDirections")}>
    <div className="space-y-3 pb-2 pt-1">
      <div className="flex flex-wrap gap-2">{project.directions.map(direction => <label key={direction.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] px-3 text-sm transition-colors has-[:checked]:border-[var(--ui-text)] has-[:checked]:bg-[var(--ui-surface-muted)]"><input type="checkbox" checked={selected.includes(direction.id)} disabled={pending} className="accent-[var(--ui-action-primary)]" onChange={event => { setMessage(null); setSelected(current => event.target.checked ? [...current, direction.id] : current.filter(id => id !== direction.id)); }}/>{direction.name ?? (direction.kind ? directionLabels(direction.kind) : t("defaultDirectionName"))}</label>)}</div>
      <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("directionHelp")}</p>
      {dirty ? <Button type="button" size="compact" variant="outline" disabled={pending || selected.length === 0} onClick={save}>{t("saveDirections")}</Button> : null}
      {message ? <p role="status" className="text-xs text-[var(--ui-text-secondary)]">{message}</p> : null}
    </div>
  </AnimatedDisclosure>;
}
