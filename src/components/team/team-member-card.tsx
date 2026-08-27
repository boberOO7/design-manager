"use client";

import { CakeSlice, MapPin, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getAvatarOriginalImageUrl } from "@/lib/user-avatar";
import { StudioMemberLifecycleControls } from "@/components/team/studio-member-lifecycle-controls";

type TeamMemberCardProps = {
  avatarUrl: string | null;
  birthDate: string | null;
  birthdayLabel: string;
  fullName: string;
  isActive: boolean;
  isAdmin: boolean;
  canEditProfile: boolean;
  editableJobTitle: string | null;
  jobTitle: string | null;
  joinedAt: string | null;
  location: string | null;
  removedAt: string | null;
  roleLabel: string;
  systemRole: "admin" | "employee";
  userId: string;
};

export function TeamMemberCard({ avatarUrl, birthDate, birthdayLabel, canEditProfile, editableJobTitle, fullName, isActive, isAdmin, jobTitle, joinedAt, location, removedAt, roleLabel, systemRole, userId }: TeamMemberCardProps) {
  const t = useTranslations("Team");
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  const [hasFailedImage, setHasFailedImage] = useState(false);
  const imageUrl = getAvatarOriginalImageUrl(avatarUrl);
  const canViewAvatar = Boolean(imageUrl) && !hasFailedImage;

  return <article className={`relative flex w-full max-w-[18.75rem] flex-col items-center rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 pb-4 pt-5 text-center ${isActive ? "" : "opacity-75"}`}>
    {isAdmin ? <StudioMemberLifecycleControls birthDate={birthDate} canEditProfile={canEditProfile} isFormer={!isActive} jobTitle={editableJobTitle} joinedAt={joinedAt} name={fullName} systemRole={systemRole} userId={userId} /> : null}
    {canViewAvatar ? <button aria-label={t("viewAvatar", { name: fullName })} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" onClick={() => setIsAvatarOpen(true)} type="button">
      <UserAvatar className="ring-4 ring-[var(--ui-surface)] transition-opacity hover:opacity-85" decorative imageUrl={avatarUrl} name={fullName} size="directoryPortrait" />
    </button> : <UserAvatar className="ring-4 ring-[var(--ui-surface)]" imageUrl={avatarUrl} name={fullName} size="directoryPortrait" />}
    <div className="min-w-0 w-full pt-4">
      <h3 className="truncate text-lg font-semibold leading-6 text-[var(--ui-text)]">{fullName}</h3>
      {jobTitle ? <p className="mt-1 truncate text-sm leading-5 text-[var(--ui-text-secondary)]">{jobTitle}</p> : <p className="mt-1 text-sm leading-5 text-[var(--ui-text-subtle)]">{t("jobTitleUnavailable")}</p>}
      {location ? <p className="mt-3 flex min-w-0 items-center justify-center gap-1.5 text-sm leading-5 text-[var(--ui-text-muted)]"><MapPin aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-subtle)]" /><span className="truncate" title={location}>{location}</span></p> : null}
      <p className="mt-2 flex items-center justify-center gap-1.5 text-xs leading-5 text-[var(--ui-text-muted)]"><span className="sr-only">{t("birthday")}: </span><CakeSlice aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ui-text-subtle)]" /><span>{birthdayLabel}</span></p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-[var(--ui-border-subtle)] pt-3 text-xs">
        <span className="rounded-full bg-[var(--ui-surface-muted)] px-2.5 py-1 font-medium text-[var(--ui-text-secondary)]">{roleLabel}</span>
        <span className={`flex items-center gap-1.5 font-medium ${isActive ? "text-[var(--ui-success-text)]" : "text-[var(--ui-text-muted)]"}`}>
          <span className={`size-1.5 rounded-full ${isActive ? "bg-[var(--ui-success-text)]" : "bg-[var(--ui-text-subtle)]"}`} />
          {isActive ? t("active") : t("former")}
        </span>
      </div>
      {!isActive && removedAt ? <p className="mt-2 text-xs text-[var(--ui-text-muted)]">{t("removedOn", { date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(removedAt)) })}</p> : null}
    </div>
    <Dialog ariaLabel={t("avatar", { name: fullName })} className="max-w-[min(92vw,48rem)] border-0 bg-transparent shadow-none sm:h-[min(92dvh,48rem)]" closeLabel={t("closeAvatar")} hideHeader isOpen={isAvatarOpen} onRequestClose={() => setIsAvatarOpen(false)}>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* The public Storage URL is not configured for Next Image and remains covered by the existing image-error fallback. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={t("avatar", { name: fullName })} className="max-h-full w-auto max-w-full object-contain" onError={() => { setHasFailedImage(true); setIsAvatarOpen(false); }} src={imageUrl} />
        <button aria-label={t("closeAvatar")} className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" data-dialog-initial-focus onClick={() => setIsAvatarOpen(false)} type="button"><X aria-hidden="true" className="size-5" /></button>
      </div>
    </Dialog>
  </article>;
}
