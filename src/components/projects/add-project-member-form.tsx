"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AssignableStudioMember } from "@/data/queries/project-members";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import {
  addProjectMembers,
  type ProjectMemberActionState,
} from "@/app/(app)/projects/[projectId]/member-actions";

export function AddProjectMemberForm({
  assignableMembers,
  projectId,
}: {
  assignableMembers: AssignableStudioMember[];
  projectId: string;
}) {
  const t = useTranslations("ProjectWorkspace");
  const roles = useTranslations("Roles");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState<ProjectMemberActionState, FormData>(
    addProjectMembers.bind(null, projectId),
    {},
  );

  useEffect(() => {
    if (state.success === "added") {
      setOpen(false);
      setQuery("");
      setSelectedIds([]);
    }
  }, [state]);

  const filteredMembers = assignableMembers.filter((member) => {
    const roleKey = member.job_title ? getCanonicalRoleTranslationKey(member.job_title) : null;
    const role = roleKey ? roles(roleKey) : member.job_title ?? "";
    return `${member.full_name} ${role}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });

  return (
    <Popover.Root open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) { setQuery(""); setSelectedIds([]); }
    }}>
      <Popover.Trigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          {t("addMembers")}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus(); }}
          className="z-50 w-[min(28rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow-popover)] data-[state=open]:animate-[checklist-picker-in_150ms_ease-out_both] data-[state=closed]:animate-[checklist-picker-in_100ms_ease-in_reverse_both] motion-reduce:animate-none"
        >
          <form action={formAction} autoComplete="off" className="space-y-3">
            {selectedIds.map((id) => <input key={id} type="hidden" name="profile_ids" value={id} />)}
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
              placeholder={t("searchMembers")}
              aria-label={t("searchMembers")}
              className="h-9 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
            />
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {filteredMembers.map((member) => {
                const roleKey = member.job_title ? getCanonicalRoleTranslationKey(member.job_title) : null;
                return (
                  <label key={member.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--ui-radius-control)] px-2 py-1.5 transition-colors hover:bg-[var(--ui-surface-muted)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ui-focus)]">
                    <input
                      type="checkbox"
                      value={member.id}
                      checked={selectedIds.includes(member.id)}
                      disabled={isPending}
                      onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, member.id] : ids.filter((id) => id !== member.id))}
                      className="order-3 ml-auto size-4 shrink-0 accent-[var(--ui-action-primary)]"
                    />
                    <UserAvatar imageUrl={member.avatar_url} name={member.full_name} size="sm" decorative />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--ui-text)]">{member.full_name}</span>
                      {member.job_title ? <span className="block truncate text-xs text-[var(--ui-text-muted)]">{roleKey ? roles(roleKey) : member.job_title}</span> : null}
                    </span>
                  </label>
                );
              })}
              {filteredMembers.length === 0 ? <p className="px-2 py-4 text-center text-sm text-[var(--ui-text-muted)]">{assignableMembers.length === 0 ? t("allAssigned") : t("noMatchingMembers")}</p> : null}
            </div>
            {state.formError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{state.formError}</p> : null}
            <div className="flex justify-end border-t border-[var(--ui-border-subtle)] pt-3">
              <Button type="submit" disabled={isPending || selectedIds.length === 0}>
                {isPending ? t("adding") : t("addMembersCount", { count: selectedIds.length })}
              </Button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
