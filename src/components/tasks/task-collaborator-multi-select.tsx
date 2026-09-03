"use client";

import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AssignableProjectMember } from "@/data/queries/project-members";
import { useTranslations } from "next-intl";

export function TaskCollaboratorMultiSelect({ assigneeId, disabled, members, onSelectedIdsChange, selectedIds }: {
  assigneeId: string | null;
  disabled: boolean;
  members: AssignableProjectMember[];
  onSelectedIdsChange: (ids: string[]) => void;
  selectedIds: string[];
}) {
  const t = useTranslations("Tasks");
  const [open, setOpen] = useState(false);
  const availableMembers = members.filter((member) => member.id !== assigneeId);
  const selectedMembers = availableMembers.filter((member) => selectedIds.includes(member.id));
  const visibleChips = selectedMembers.slice(0, 2);
  const overflowCount = selectedMembers.length - visibleChips.length;
  function toggle(memberId: string) { onSelectedIdsChange(selectedIds.includes(memberId) ? selectedIds.filter((id) => id !== memberId) : [...selectedIds, memberId]); }

  return <Popover.Root open={open} onOpenChange={setOpen}><div className="relative flex h-11 min-w-0 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2 text-sm transition-colors hover:border-[var(--ui-border)]"><Popover.Trigger asChild><button type="button" disabled={disabled} aria-label={t("coAssignees")} className="absolute inset-0 rounded-[var(--ui-radius-control)] outline-none transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-60" /></Popover.Trigger>{selectedMembers.length ? <div className="relative z-10 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden" aria-live="polite">{visibleChips.map((member) => <button key={member.id} type="button" disabled={disabled} onClick={() => toggle(member.id)} className="inline-flex min-w-0 shrink items-center gap-1 rounded-full bg-[var(--ui-surface-strong)] py-0.5 pl-0.5 pr-1.5 text-xs font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed" aria-label={t("removeCoAssignee", { name: member.full_name })}><UserAvatar decorative imageUrl={member.avatar_url} name={member.full_name} size="board" /><span className="max-w-20 truncate">{member.full_name}</span><X aria-hidden="true" className="size-3 shrink-0 text-[var(--ui-text-secondary)]" /></button>)}{overflowCount > 0 ? <span className="shrink-0 rounded-full bg-[var(--ui-surface-strong)] px-1.5 py-0.5 text-xs font-semibold text-[var(--ui-text-secondary)]">+{overflowCount}</span> : null}</div> : <span className="pointer-events-none relative z-10 truncate text-[var(--ui-text-muted)]">{t("addCoAssignees")}</span>}<ChevronDown aria-hidden="true" className="pointer-events-none relative z-10 ml-auto size-4 shrink-0 text-[var(--ui-text-muted)]" /></div><Popover.Portal><Popover.Content align="start" sideOffset={6} className="z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-1.5 shadow-[var(--ui-shadow-popover)]"><div className="max-h-64 overflow-y-auto">{availableMembers.length ? availableMembers.map((member) => <label key={member.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--ui-surface-muted)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ui-focus)]"><input type="checkbox" checked={selectedIds.includes(member.id)} disabled={disabled} onChange={() => toggle(member.id)} className="size-4 shrink-0 accent-[var(--ui-action-primary)]" /><UserAvatar decorative imageUrl={member.avatar_url} name={member.full_name} size="boardCard" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ui-text)]">{member.full_name}</span></label>) : <p className="p-3 text-sm text-[var(--ui-text-muted)]">{t("noCoAssigneeResults")}</p>}</div></Popover.Content></Popover.Portal></Popover.Root>;
}
