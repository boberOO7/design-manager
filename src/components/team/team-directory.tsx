"use client";

import { TeamMemberCard } from "@/components/team/team-member-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Member = { avatar_url: string | null; birth_date: string | null; birthdayLabel: string; editableJobTitle: string | null; full_name: string; id: string; is_active: boolean; jobTitle: string | null; joined_at: string | null; location: string | null; removed_at: string | null; roleLabel: string; systemRole: "admin" | "employee" };
export function TeamDirectory({ currentUserId, isAdmin, members }: { currentUserId: string | null; isAdmin: boolean; members: Member[] }) {
  const t = useTranslations("Team"); const [mode, setMode] = useState<"active" | "former">("active");
  const visible = members.filter((member) => mode === "active" ? member.is_active : !member.is_active);
  return <section aria-labelledby="team-directory-heading"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="team-directory-heading" className="text-lg font-semibold text-[var(--ui-text)]">{t("directory")}</h2><p className="text-sm text-[var(--ui-text-muted)]">{mode === "active" ? t("memberCount", { count: visible.length }) : t("formerMemberCount", { count: visible.length })}</p></div>{isAdmin ? <SegmentedControl ariaLabel={t("directoryMode")} items={[{ value: "active", label: t("activeDirectory") }, { value: "former", label: t("formerDirectory") }]} onValueChange={setMode} value={mode} /> : null}</div>
    {visible.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] p-8 text-center"><p className="font-medium text-[var(--ui-text)]">{mode === "active" ? t("noMembers") : t("noFormerMembers")}</p><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{mode === "active" ? t("noMembersDescription") : t("noFormerMembersDescription")}</p></div> : <div className="grid grid-cols-1 justify-items-start gap-4 sm:grid-cols-[repeat(auto-fill,minmax(16.25rem,18.75rem))]">{visible.map((member) => <TeamMemberCard avatarUrl={member.avatar_url} birthDate={member.birth_date} birthdayLabel={member.birthdayLabel} canEditProfile={isAdmin && member.is_active && member.id !== currentUserId} editableJobTitle={member.editableJobTitle} fullName={member.full_name} isActive={member.is_active} isAdmin={isAdmin} jobTitle={member.jobTitle} joinedAt={member.joined_at} key={member.id} location={member.location} removedAt={member.removed_at} roleLabel={member.roleLabel} systemRole={member.systemRole} userId={member.id} />)}</div>}
  </section>;
}
