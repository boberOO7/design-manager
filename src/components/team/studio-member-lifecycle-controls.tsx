"use client";

import * as Popover from "@radix-ui/react-popover";
import { removeStudioMember, restoreStudioMember } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { MoreHorizontal } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Json } from "@/types/database.types";
import type { StudioMemberActionState } from "@/lib/validation/team-membership";

type EligibleMember = { id: string; fullName: string };
type OpenTask = { id: string; title: string; status: string; dueDate: string | null; eligibleMembers: EligibleMember[] };
type ProjectImpact = { projectId: string; projectName: string; tasks: OpenTask[] };
type Impact = { openTaskCount: number; overdueTaskCount: number; activeProjectCount: number; projects: ProjectImpact[] };

function isImpact(value: Json | null): value is Impact {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && typeof value.openTaskCount === "number" && typeof value.overdueTaskCount === "number" && typeof value.activeProjectCount === "number"
    && Array.isArray(value.projects);
}

export function StudioMemberLifecycleControls({ isFormer, name, userId }: { isFormer: boolean; name: string; userId: string }) {
  const t = useTranslations("Team");
  const locale = useLocale();
  const unassignedLabel = locale === "uk" ? "Без відповідального" : "Unassigned";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [impactError, setImpactError] = useState(false);
  const [allowUnassigned, setAllowUnassigned] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionState(async (previousState: StudioMemberActionState, formData: FormData) => {
    const result = await (isFormer ? restoreStudioMember : removeStudioMember)(previousState, formData);
    if (result.success === "removed") setDialogOpen(false);
    return result;
  }, {});

  async function openRemoval() {
    setMenuOpen(false); setDialogOpen(true); setImpact(null); setImpactError(false); setAllowUnassigned(false); setAssignments({});
    const { data, error } = await createClient().rpc("get_studio_member_removal_impact", { p_user_id: userId });
    if (error || !isImpact(data)) setImpactError(true); else setImpact(data);
  }

  function selectProjectAssignee(project: ProjectImpact, assigneeId: string) {
    setAssignments((current) => {
      const next = { ...current };
      for (const task of project.tasks) {
        if (assigneeId && task.eligibleMembers.some((member) => member.id === assigneeId)) next[task.id] = assigneeId;
        else delete next[task.id];
      }
      return next;
    });
  }

  const tasks = impact?.projects.flatMap((project) => project.tasks) ?? [];
  const selectedAssignments = Object.entries(assignments).filter(([, assigneeId]) => assigneeId);
  const reassignedCount = tasks.filter((task) => assignments[task.id]).length;
  const unassignedCount = tasks.length - reassignedCount;
  const unresolved = tasks.some((task) => !assignments[task.id]);

  if (isFormer) return <form action={action}><input name="user_id" type="hidden" value={userId} /><Button className="mt-3" disabled={pending} size="sm" type="submit" variant="outline">{pending ? t("restoringAccess") : t("restoreAccess")}</Button>{state.formError ? <p role="alert" className="mt-2 text-xs text-[var(--ui-danger-text)]">{t("membershipActionFailed")}</p> : null}</form>;

  return <div className="absolute right-2 top-2">
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Popover.Trigger asChild><button ref={triggerRef} aria-label={t("memberActions", { name })} className="flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" type="button"><MoreHorizontal aria-hidden="true" className="size-5" /></button></Popover.Trigger>
      <Popover.Portal><Popover.Content align="end" className="z-[70] w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]" onOpenAutoFocus={(event) => event.preventDefault()} sideOffset={6}><button className="flex min-h-9 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--ui-danger-text)] transition-colors hover:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => void openRemoval()} type="button">{t("removeFromStudio")}</button></Popover.Content></Popover.Portal>
    </Popover.Root>
    <Dialog ariaLabel={t("removeMemberTitle", { name })} closeDisabled={pending} closeLabel={t("cancel")} description={t("removeMemberDescription", { name })} isOpen={dialogOpen} onRequestClose={() => { if (!pending) setDialogOpen(false); }} returnFocusRef={triggerRef} title={t("removeMemberTitle", { name })}>
      <form action={action} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 overflow-y-auto p-4 sm:p-6"><input name="user_id" type="hidden" value={userId} /><input name="allow_unassigned" type="hidden" value={String(allowUnassigned)} /><input name="reassignments" type="hidden" value={JSON.stringify(selectedAssignments.map(([taskId, assigneeId]) => ({ taskId, assigneeId })))} />
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("removeMemberNotice")}</p>
        {impactError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{t("impactLoadFailed")}</p> : !impact ? <p className="mt-4 text-sm text-[var(--ui-text-muted)]">{t("loadingImpact")}</p> : <>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{t("openTasks")}</dt><dd className="font-semibold">{impact.openTaskCount}</dd></div><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{t("overdueTasks")}</dt><dd className="font-semibold">{impact.overdueTaskCount}</dd></div><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{t("activeProjects")}</dt><dd className="font-semibold">{impact.activeProjectCount}</dd></div></dl>
          {tasks.length > 0 ? <section className="mt-5" aria-label={t("reassignOpenWork")}><h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("reassignOpenWork")}</h3><div className="mt-3 space-y-4">{impact.projects.map((project) => <section key={project.projectId} className="overflow-hidden rounded-xl border border-[var(--ui-border)]"><div className="grid gap-3 bg-[var(--ui-surface-subtle)] px-3 py-3 sm:grid-cols-[minmax(0,1fr)_22rem] sm:items-center"><h4 className="min-w-0 truncate text-sm font-semibold text-[var(--ui-text)]">{project.projectName}</h4><label className="grid min-w-0 gap-1.5 text-xs text-[var(--ui-text-secondary)] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-2"><span className="shrink-0">{t("assignAll")}</span><Select aria-label={t("assignAllForProject", { project: project.projectName })} className="min-w-0" defaultValue="" onValueChange={(assigneeId) => selectProjectAssignee(project, assigneeId)} placeholder={t("selectReplacement")}><SelectItem value="">{t("selectReplacement")}</SelectItem>{Array.from(new Map(project.tasks.flatMap((task) => task.eligibleMembers).map((member) => [member.id, member])).values()).map((member) => <SelectItem key={member.id} value={member.id}>{member.fullName}</SelectItem>)}</Select></label></div><div className="divide-y divide-[var(--ui-border-subtle)]">{project.tasks.map((task) => <div key={task.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--ui-text)]">{task.title}</p><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{t(`taskStatus.${task.status}`)}{task.dueDate ? ` · ${t("dueDate", { date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${task.dueDate}T00:00:00`)) })}` : ""}</p></div>{task.eligibleMembers.length ? <Select aria-label={t("assigneeForTask", { task: task.title })} className="min-w-[12.5rem] max-w-full" onValueChange={(assigneeId) => setAssignments((current) => ({ ...current, [task.id]: assigneeId }))} placeholder={unassignedLabel} value={assignments[task.id] ?? ""} width="content"><SelectItem value="">{unassignedLabel}</SelectItem>{task.eligibleMembers.map((member) => <SelectItem key={member.id} value={member.id}>{member.fullName}</SelectItem>)}</Select> : <p role="status" className="text-xs text-[var(--ui-danger-text)]">{t("noEligibleTaskReplacement")}</p>}</div>)}</div></section>)}</div><label className="group mt-4 flex items-start gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:border-[var(--ui-focus)] focus-within:ring-2 focus-within:ring-[var(--ui-focus-soft)]"><input checked={allowUnassigned} className="mt-0.5 size-5 shrink-0 rounded border-[var(--ui-border-strong)] accent-[var(--ui-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" onChange={(event) => setAllowUnassigned(event.target.checked)} type="checkbox" /><span className="min-w-0"><span className="block text-sm font-semibold text-[var(--ui-text)]">{t("allowUnassigned")}</span><span className="mt-1 block text-xs leading-5 text-[var(--ui-text-muted)]">{t("allowUnassignedHelp")}</span></span></label></section> : null}
        </>}
        {state.formError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{t("membershipActionFailed")}</p> : null}</div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6"><p className="text-xs font-medium text-[var(--ui-text-muted)]">{tasks.length > 0 ? t("removalSummary", { reassigned: reassignedCount, unassigned: unassignedCount }) : null}</p><div className="flex gap-3"><Button disabled={pending} onClick={() => setDialogOpen(false)} type="button" variant="outline">{t("cancel")}</Button><Button className="bg-[var(--ui-action-danger)] text-[var(--ui-action-primary-text)] hover:opacity-90 disabled:bg-[var(--ui-surface-muted)] disabled:text-[var(--ui-text-muted)] disabled:!opacity-100" disabled={pending || !impact || impactError || (!allowUnassigned && unresolved)} type="submit">{pending ? t("removing") : t("confirmRemove")}</Button></div></footer>
      </form>
    </Dialog>
  </div>;
}
