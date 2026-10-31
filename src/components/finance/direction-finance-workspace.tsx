"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link2, Plus } from "lucide-react";
import { saveOrderDirections } from "@/app/(app)/projects/[projectId]/direction-actions";
import { useProjectWorkspaceNavigation } from "@/components/projects/project-workspace-navigation";
import type { FinanceProjectData } from "@/data/queries/finance";
import { projectAgreementName } from "@/lib/finance-project-view";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function DirectionFinanceActions({ project, directionId }: { project: FinanceProjectData; directionId: string }) {
  const t = useTranslations("Finance"), navigation = useProjectWorkspaceNavigation();
  const [attaching, setAttaching] = useState(false), [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const available = project.orders.filter(order => order.status !== "discarded" && !project.directionLinks.some(link => link.order_id === order.id && link.direction_id === directionId));
  if (!available.length) return null;
  return <>
    <Button type="button" size="compact" variant="ghost" className="gap-1.5" onClick={() => setAttaching(true)}><Link2 aria-hidden="true" className="size-3.5"/>{t("directionWorkspace.attach")}</Button>
    {attaching ? <Dialog isOpen title={t("directionWorkspace.attach")} closeLabel={t("movements.close")} closeDisabled={pending} onRequestClose={() => setAttaching(false)} className="h-auto max-h-[calc(100dvh-1rem)] max-w-md">
      <div className="min-h-0 space-y-2 overflow-y-auto p-3">
        <p className="px-3 text-xs leading-5 text-[var(--ui-text-secondary)]">{t("agreements.attachHelp")}</p>
        {available.map(order => <button key={order.id} type="button" disabled={pending} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--ui-radius-control)] px-3 py-2 text-left text-sm font-medium transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none" onClick={() => {
          setError(null);
          const ids = [...new Set([...project.directionLinks.filter(link => link.order_id === order.id).map(link => link.direction_id), directionId])];
          startTransition(async () => {
            const result = await saveOrderDirections(project.projectId, order.id, ids, project.directionVersion).catch(() => ({ success: false, error: "failed" } as const));
            if (!result.success) { setError(t(result.error === "conflict" ? "orders.directionsConflict" : result.error === "milestones" ? "orders.directionsMilestones" : "orders.directionsFailed")); return; }
            setAttaching(false); navigation?.refresh();
          });
        }}><span className="min-w-0 break-words">{projectAgreementName(order.name, t("orders.defaultName"))}</span><Plus aria-hidden="true" className="size-4 shrink-0"/></button>)}
        {error ? <p role="alert" className="p-3 text-xs text-[var(--ui-danger-text)]">{error}</p> : null}
      </div>
    </Dialog> : null}
  </>;
}
