"use client";

import { Select, SelectItem } from "@/components/ui/select";
import type { Json } from "@/types/database.types";
import type { useTranslations } from "next-intl";

export type EligibleMember = { id: string; fullName: string };
export type OpenTask = { id: string; title: string; status: string; dueDate: string | null; eligibleMembers: EligibleMember[] };
export type ProjectImpact = { projectId: string; projectName: string; tasks: OpenTask[] };
export type MemberRemovalImpact = { openTaskCount: number; overdueTaskCount: number; activeProjectCount: number; projects: ProjectImpact[] };
type TeamTranslations = ReturnType<typeof useTranslations<"Team">>;

export function isMemberRemovalImpact(value: Json | null): value is MemberRemovalImpact {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && typeof value.openTaskCount === "number" && typeof value.overdueTaskCount === "number" && typeof value.activeProjectCount === "number"
    && Array.isArray(value.projects);
}

export function OpenWorkReassignment({ assignments, impact, locale, onAssignmentsChange, t }: {
  assignments: Record<string, string>;
  impact: MemberRemovalImpact;
  locale: string;
  onAssignmentsChange: (next: Record<string, string>) => void;
  t: TeamTranslations;
}) {
  const unassignedLabel = locale === "uk" ? "Без відповідального" : "Unassigned";
  const selectProjectAssignee = (project: ProjectImpact, assigneeId: string) => {
    const next = { ...assignments };
    for (const task of project.tasks) {
      if (assigneeId && task.eligibleMembers.some((member) => member.id === assigneeId)) next[task.id] = assigneeId;
      else delete next[task.id];
    }
    onAssignmentsChange(next);
  };

  return <section className="mt-5" aria-label={t("reassignOpenWork")}><h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("reassignOpenWork")}</h3><div className="mt-3 space-y-4">{impact.projects.map((project) => <section key={project.projectId} className="overflow-hidden rounded-xl border border-[var(--ui-border)]"><div className="grid gap-3 bg-[var(--ui-surface-subtle)] px-3 py-3 sm:grid-cols-[minmax(0,1fr)_22rem] sm:items-center"><h4 className="min-w-0 truncate text-sm font-semibold text-[var(--ui-text)]">{project.projectName}</h4><label className="grid min-w-0 gap-1.5 text-xs text-[var(--ui-text-secondary)] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-2"><span className="shrink-0">{t("assignAll")}</span><Select aria-label={t("assignAllForProject", { project: project.projectName })} className="min-w-0" defaultValue="" onValueChange={(assigneeId) => selectProjectAssignee(project, assigneeId)} placeholder={t("selectReplacement")}><SelectItem value="">{t("selectReplacement")}</SelectItem>{Array.from(new Map(project.tasks.flatMap((task) => task.eligibleMembers).map((member) => [member.id, member])).values()).map((member) => <SelectItem key={member.id} value={member.id}>{member.fullName}</SelectItem>)}</Select></label></div><div className="divide-y divide-[var(--ui-border-subtle)]">{project.tasks.map((task) => <div key={task.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--ui-text)]">{task.title}</p><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{t(`taskStatus.${task.status}`)}{task.dueDate ? ` · ${t("dueDate", { date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${task.dueDate}T00:00:00`)) })}` : ""}</p></div>{task.eligibleMembers.length ? <Select aria-label={t("assigneeForTask", { task: task.title })} className="min-w-[12.5rem] max-w-full" onValueChange={(assigneeId) => onAssignmentsChange({ ...assignments, [task.id]: assigneeId })} placeholder={unassignedLabel} value={assignments[task.id] ?? ""} width="content"><SelectItem value="">{unassignedLabel}</SelectItem>{task.eligibleMembers.map((member) => <SelectItem key={member.id} value={member.id}>{member.fullName}</SelectItem>)}</Select> : <p role="status" className="text-xs text-[var(--ui-danger-text)]">{t("noEligibleTaskReplacement")}</p>}</div>)}</div></section>)}</div></section>;
}
