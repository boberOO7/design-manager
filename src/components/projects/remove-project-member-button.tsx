"use client";

import { removeProjectMember, type ProjectMemberActionState } from "@/app/(app)/projects/[projectId]/member-actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { OpenWorkReassignment, type MemberRemovalImpact, isMemberRemovalImpact } from "@/components/team/open-work-reassignment";
import { createClient } from "@/lib/supabase/client";
import { useActionState, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export function RemoveProjectMemberButton({ assignmentId, memberName, projectId, userId }: { assignmentId: string; memberName: string; projectId: string; userId: string }) {
  const projectT = useTranslations("ProjectWorkspace");
  const teamT = useTranslations("Team");
  const locale = useLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [impact, setImpact] = useState<MemberRemovalImpact | null>(null);
  const [impactError, setImpactError] = useState(false);
  const [allowUnassigned, setAllowUnassigned] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const action = removeProjectMember.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ProjectMemberActionState, FormData>(async (previousState, formData) => {
    const result = await action(previousState, formData);
    if (result.success === "removed") setDialogOpen(false);
    return result;
  }, {});
  const tasks = impact?.projects.flatMap((project) => project.tasks) ?? [];
  const unresolved = tasks.some((task) => !assignments[task.id]);
  const selectedAssignments = Object.entries(assignments).filter(([, assigneeId]) => assigneeId);

  async function openRemoval() {
    setDialogOpen(true); setImpact(null); setImpactError(false); setAllowUnassigned(false); setAssignments({});
    const { data, error } = await createClient().rpc("get_project_member_removal_impact", { p_assignment_id: assignmentId });
    if (error || !isMemberRemovalImpact(data)) setImpactError(true); else setImpact(data);
  }

  const removeFromProject = locale === "uk" ? "Видалити з проєкту" : "Remove from project";
  const notice = locale === "uk" ? "Ця людина втратить доступ лише до цього проєкту. Завершені й скасовані завдання збережуть поточного виконавця." : "This person will lose access only to this project. Completed and cancelled tasks will keep their current assignee.";
  return <div className="space-y-2"><Button ref={triggerRef} disabled={pending} onClick={() => void openRemoval()} size="sm" type="button" variant="ghost">{projectT("remove")}</Button><Dialog ariaLabel={projectT("removeMember", { name: memberName })} closeDisabled={pending} closeLabel={teamT("cancel")} description={notice} isOpen={dialogOpen} onRequestClose={() => { if (!pending) setDialogOpen(false); }} returnFocusRef={triggerRef} title={projectT("removeMember", { name: memberName })}><form action={formAction} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 overflow-y-auto p-4 sm:p-6"><input name="assignment_id" type="hidden" value={assignmentId} /><input name="user_id" type="hidden" value={userId} /><input name="allow_unassigned" type="hidden" value={String(allowUnassigned)} /><input name="reassignments" type="hidden" value={JSON.stringify(selectedAssignments.map(([taskId, assigneeId]) => ({ taskId, assigneeId })))} /><p className="text-sm text-[var(--ui-text-secondary)]">{notice}</p>{impactError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{teamT("impactLoadFailed")}</p> : !impact ? <p className="mt-4 text-sm text-[var(--ui-text-muted)]">{teamT("loadingImpact")}</p> : <><dl className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{teamT("openTasks")}</dt><dd className="font-semibold">{impact.openTaskCount}</dd></div><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{teamT("overdueTasks")}</dt><dd className="font-semibold">{impact.overdueTaskCount}</dd></div></dl>{tasks.length > 0 ? <><OpenWorkReassignment assignments={assignments} impact={impact} locale={locale} onAssignmentsChange={setAssignments} t={teamT} /><label className="group mt-4 flex items-start gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:border-[var(--ui-focus)] focus-within:ring-2 focus-within:ring-[var(--ui-focus-soft)]"><input checked={allowUnassigned} className="mt-0.5 size-5 shrink-0 rounded border-[var(--ui-border-strong)] accent-[var(--ui-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" onChange={(event) => setAllowUnassigned(event.target.checked)} type="checkbox" /><span className="min-w-0"><span className="block text-sm font-semibold text-[var(--ui-text)]">{teamT("allowUnassigned")}</span><span className="mt-1 block text-xs leading-5 text-[var(--ui-text-muted)]">{teamT("allowUnassignedHelp")}</span></span></label></> : null}</>}{state.formError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{state.formError}</p> : null}</div><footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6"><p className="text-xs font-medium text-[var(--ui-text-muted)]">{tasks.length > 0 ? teamT("removalSummary", { reassigned: tasks.length - tasks.filter((task) => !assignments[task.id]).length, unassigned: tasks.filter((task) => !assignments[task.id]).length }) : null}</p><div className="flex gap-3"><Button disabled={pending} onClick={() => setDialogOpen(false)} type="button" variant="outline">{teamT("cancel")}</Button><Button className="bg-[var(--ui-action-danger)] text-[var(--ui-action-primary-text)] hover:opacity-90 disabled:bg-[var(--ui-surface-muted)] disabled:text-[var(--ui-text-muted)] disabled:!opacity-100" disabled={pending || !impact || impactError || (!allowUnassigned && unresolved)} type="submit">{pending ? projectT("removing") : removeFromProject}</Button></div></footer></form></Dialog></div>;
}
