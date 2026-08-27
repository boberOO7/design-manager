"use client";

import * as Popover from "@radix-ui/react-popover";
import { removeStudioMember, restoreStudioMember } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { OpenWorkReassignment, type MemberRemovalImpact, isMemberRemovalImpact } from "@/components/team/open-work-reassignment";
import { StudioMemberProfileEditor } from "@/components/team/studio-member-profile-editor";
import { createClient } from "@/lib/supabase/client";
import { MoreHorizontal } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { StudioMemberActionState } from "@/lib/validation/team-membership";

export function StudioMemberLifecycleControls({ birthDate, canEditProfile, isFormer, jobTitle, joinedAt, name, systemRole, userId }: { birthDate: string | null; canEditProfile: boolean; isFormer: boolean; jobTitle: string | null; joinedAt: string | null; name: string; systemRole: "admin" | "employee"; userId: string }) {
  const t = useTranslations("Team");
  const locale = useLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [impact, setImpact] = useState<MemberRemovalImpact | null>(null);
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
    if (error || !isMemberRemovalImpact(data)) setImpactError(true); else setImpact(data);
  }

  const tasks = impact?.projects.flatMap((project) => project.tasks) ?? [];
  const selectedAssignments = Object.entries(assignments).filter(([, assigneeId]) => assigneeId);
  const reassignedCount = tasks.filter((task) => assignments[task.id]).length;
  const unassignedCount = tasks.length - reassignedCount;
  const unresolved = tasks.some((task) => !assignments[task.id]);

  return <div className="absolute right-2 top-2">
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Popover.Trigger asChild><button ref={triggerRef} aria-label={t("memberActions", { name })} className="flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" type="button"><MoreHorizontal aria-hidden="true" className="size-5" /></button></Popover.Trigger>
      <Popover.Portal><Popover.Content align="end" className="z-[70] w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]" onOpenAutoFocus={(event) => event.preventDefault()} sideOffset={6}>{isFormer ? <form action={action}><input name="user_id" type="hidden" value={userId} /><button className="flex min-h-9 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50" disabled={pending} type="submit">{pending ? t("restoringAccess") : t("restoreAccess")}</button>{state.formError ? <p role="alert" className="px-3 pb-2 pt-1 text-xs text-[var(--ui-danger-text)]">{t("membershipActionFailed")}</p> : null}</form> : <>{canEditProfile ? <button className="flex min-h-9 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => { setMenuOpen(false); setProfileDialogOpen(true); }} type="button">{t("editProfile")}</button> : null}<button className="flex min-h-9 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--ui-danger-text)] transition-colors hover:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => void openRemoval()} type="button">{t("removeFromStudio")}</button></>}</Popover.Content></Popover.Portal>
    </Popover.Root>
    <Dialog ariaLabel={t("removeMemberTitle", { name })} closeDisabled={pending} closeLabel={t("cancel")} description={t("removeMemberDescription", { name })} isOpen={dialogOpen} onRequestClose={() => { if (!pending) setDialogOpen(false); }} returnFocusRef={triggerRef} title={t("removeMemberTitle", { name })}>
      <form action={action} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 overflow-y-auto p-4 sm:p-6"><input name="user_id" type="hidden" value={userId} /><input name="allow_unassigned" type="hidden" value={String(allowUnassigned)} /><input name="reassignments" type="hidden" value={JSON.stringify(selectedAssignments.map(([taskId, assigneeId]) => ({ taskId, assigneeId })))} />
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("removeMemberNotice")}</p>
        {impactError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{t("impactLoadFailed")}</p> : !impact ? <p className="mt-4 text-sm text-[var(--ui-text-muted)]">{t("loadingImpact")}</p> : <>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{t("openTasks")}</dt><dd className="font-semibold">{impact.openTaskCount}</dd></div><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{t("overdueTasks")}</dt><dd className="font-semibold">{impact.overdueTaskCount}</dd></div><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{t("activeProjects")}</dt><dd className="font-semibold">{impact.activeProjectCount}</dd></div></dl>
          {tasks.length > 0 ? <><OpenWorkReassignment assignments={assignments} impact={impact} locale={locale} onAssignmentsChange={setAssignments} t={t} /><label className="group mt-4 flex items-start gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:border-[var(--ui-focus)] focus-within:ring-2 focus-within:ring-[var(--ui-focus-soft)]"><input checked={allowUnassigned} className="mt-0.5 size-5 shrink-0 rounded border-[var(--ui-border-strong)] accent-[var(--ui-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" onChange={(event) => setAllowUnassigned(event.target.checked)} type="checkbox" /><span className="min-w-0"><span className="block text-sm font-semibold text-[var(--ui-text)]">{t("allowUnassigned")}</span><span className="mt-1 block text-xs leading-5 text-[var(--ui-text-muted)]">{t("allowUnassignedHelp")}</span></span></label></> : null}
        </>}
        {state.formError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{t("membershipActionFailed")}</p> : null}</div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6"><p className="text-xs font-medium text-[var(--ui-text-muted)]">{tasks.length > 0 ? t("removalSummary", { reassigned: reassignedCount, unassigned: unassignedCount }) : null}</p><div className="flex gap-3"><Button disabled={pending} onClick={() => setDialogOpen(false)} type="button" variant="outline">{t("cancel")}</Button><Button className="bg-[var(--ui-action-danger)] text-[var(--ui-action-primary-text)] hover:opacity-90 disabled:bg-[var(--ui-surface-muted)] disabled:text-[var(--ui-text-muted)] disabled:!opacity-100" disabled={pending || !impact || impactError || (!allowUnassigned && unresolved)} type="submit">{pending ? t("removing") : t("confirmRemove")}</Button></div></footer>
      </form>
    </Dialog>
    {canEditProfile && profileDialogOpen ? <StudioMemberProfileEditor birthDate={birthDate} fullName={name} isOpen={profileDialogOpen} jobTitle={jobTitle} joinedAt={joinedAt} onRequestClose={() => setProfileDialogOpen(false)} returnFocusRef={triggerRef} systemRole={systemRole} userId={userId} /> : null}
  </div>;
}
