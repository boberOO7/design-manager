"use client";

import { removeStudioMember, restoreStudioMember } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { MoreHorizontal } from "lucide-react";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { Json } from "@/types/database.types";

type Impact = { openTaskCount: number; overdueTaskCount: number; activeProjectCount: number; eligibleMembers: Array<{ id: string; fullName: string }> };
function isImpact(value: Json | null): value is Impact {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && typeof value.openTaskCount === "number" && typeof value.overdueTaskCount === "number" && typeof value.activeProjectCount === "number"
    && Array.isArray(value.eligibleMembers);
}

export function StudioMemberLifecycleControls({ isFormer, name, userId }: { isFormer: boolean; name: string; userId: string }) {
  const t = useTranslations("Team");
  const [menuOpen, setMenuOpen] = useState(false); const [dialogOpen, setDialogOpen] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null); const [impactError, setImpactError] = useState(false);
  const [state, action, pending] = useActionState(isFormer ? restoreStudioMember : removeStudioMember, {});
  async function openRemoval() {
    setMenuOpen(false); setDialogOpen(true); setImpact(null); setImpactError(false);
    const { data, error } = await createClient().rpc("get_studio_member_removal_impact", { p_user_id: userId });
    if (error || !isImpact(data)) setImpactError(true); else setImpact(data);
  }
  if (isFormer) return <form action={action}><input name="user_id" type="hidden" value={userId} /><Button className="mt-3" disabled={pending} size="sm" type="submit" variant="outline">{pending ? t("restoringAccess") : t("restoreAccess")}</Button>{state.formError ? <p role="alert" className="mt-2 text-xs text-[var(--ui-danger-text)]">{t("membershipActionFailed")}</p> : null}</form>;
  return <div className="absolute right-2 top-2">
    <button aria-expanded={menuOpen} aria-label={t("memberActions", { name })} className="flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => setMenuOpen((open) => !open)} type="button"><MoreHorizontal aria-hidden="true" className="size-5" /></button>
    {menuOpen ? <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-lg"><button className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" onClick={() => void openRemoval()} type="button">{t("removeFromStudio")}</button></div> : null}
    <Dialog ariaLabel={t("removeMemberTitle", { name })} closeDisabled={pending} closeLabel={t("cancel")} description={t("removeMemberDescription", { name })} isOpen={dialogOpen} onRequestClose={() => { if (!pending) setDialogOpen(false); }} title={t("removeMemberTitle", { name })}>
      <form action={action} className="overflow-y-auto p-4 sm:p-6"><input name="user_id" type="hidden" value={userId} />
        <p className="text-sm text-[var(--ui-text-secondary)]">{t("removeMemberNotice")}</p>
        {impactError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{t("impactLoadFailed")}</p> : !impact ? <p className="mt-4 text-sm text-[var(--ui-text-muted)]">{t("loadingImpact")}</p> : <>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{t("openTasks")}</dt><dd className="font-semibold">{impact.openTaskCount}</dd></div><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{t("overdueTasks")}</dt><dd className="font-semibold">{impact.overdueTaskCount}</dd></div><div className="rounded-lg bg-[var(--ui-surface-muted)] p-2"><dt className="text-xs text-[var(--ui-text-muted)]">{t("activeProjects")}</dt><dd className="font-semibold">{impact.activeProjectCount}</dd></div></dl>
          {impact.openTaskCount > 0 ? <label className="mt-4 block text-sm font-medium text-[var(--ui-text-secondary)]">{t("reassignOpenWork")}<select className="mt-2 min-h-11 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm" name="reassignment_user_id" required defaultValue=""><option disabled value="">{t("selectReplacement")}</option>{impact.eligibleMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>{impact.eligibleMembers.length === 0 ? <p role="alert" className="mt-2 text-sm text-[var(--ui-danger-text)]">{t("noEligibleReplacement")}</p> : null}</label> : null}
        </>}
        {state.formError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{t("membershipActionFailed")}</p> : null}<div className="mt-6 flex justify-end gap-3 border-t border-[var(--ui-border)] pt-4"><Button disabled={pending} onClick={() => setDialogOpen(false)} type="button" variant="outline">{t("cancel")}</Button><Button className="bg-[var(--ui-danger-text)] text-white hover:opacity-90" disabled={pending || !impact || impactError || (impact.openTaskCount > 0 && impact.eligibleMembers.length === 0)} type="submit">{pending ? t("removing") : t("confirmRemove")}</Button></div>
      </form>
    </Dialog>
  </div>;
}
