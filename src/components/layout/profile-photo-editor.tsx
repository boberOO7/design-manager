"use client";

import { Camera } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ProfileEditorLoading } from "@/components/layout/profile-avatar-editor";

const ProfilePhotoDialog = lazy(() => import("./profile-photo-dialog").then((module) => ({ default: module.ProfilePhotoDialog })));

export function ProfilePhotoEditor({ avatarUrl, fullName, userId }: { avatarUrl?: string; fullName: string; userId: string }) {
  const t = useTranslations("Account");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(avatarUrl);
  useEffect(() => setCurrentAvatarUrl(avatarUrl), [avatarUrl]);

  return <span className="relative inline-flex size-28 shrink-0 sm:size-40">
    <button ref={triggerRef} aria-label={t("editProfilePhoto")} aria-haspopup="dialog" aria-expanded={isOpen} className="group relative size-full rounded-[1.25rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-surface)] sm:rounded-[1.5rem]" onClick={() => setIsOpen(true)} type="button">
      <UserAvatar imageUrl={currentAvatarUrl} name={fullName} size="directoryPortrait" decorative className="size-full rounded-[inherit] text-4xl sm:text-5xl" />
      <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-black/55 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"><Camera className="size-5" /><span className="text-xs font-medium">{t("changePhoto")}</span></span>
      <span aria-hidden="true" className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-2 border-[var(--ui-surface)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)] transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:transition-none"><Camera className="size-4" /></span>
    </button>
    <Suspense fallback={isOpen ? <ProfileEditorLoading onClose={() => setIsOpen(false)} /> : null}>
      {isOpen ? <ProfilePhotoDialog avatarUrl={currentAvatarUrl} fullName={fullName} userId={userId} isOpen={isOpen} onClose={() => setIsOpen(false)} onAvatarChanged={setCurrentAvatarUrl} returnFocusRef={triggerRef} /> : null}
    </Suspense>
  </span>;
}
