"use client";

import { Camera, LoaderCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { SystemRole } from "@/types";

const ProfileEditorDialog = lazy(() => import("@/components/layout/profile-editor-dialog").then((module) => ({ default: module.ProfileEditorDialog })));

export type ProfileAvatarEditorProps = {
  avatarUrl?: string;
  birthDate?: string | null;
  city?: string | null;
  cityGeoNamesId?: number | null;
  countryCode?: string | null;
  fullName: string;
  joinedAt: string | null;
  notificationPopupsEnabled: boolean;
  notificationSoundEnabled: boolean;
  systemRole: SystemRole;
  userId: string;
};

export function ProfileAvatarEditor(props: ProfileAvatarEditorProps) {
  const t = useTranslations("Account");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [requested, setRequested] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [googleCalendarResult, setGoogleCalendarResult] = useState<string | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(props.avatarUrl);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("googleCalendar");
    if (!result) return;
    url.searchParams.delete("googleCalendar");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const timeoutId = window.setTimeout(() => {
      setGoogleCalendarResult(result);
      setRequested(true);
      setIsOpen(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function closeDialog() {
    setIsOpen(false);
  }

  return <span className="relative inline-flex shrink-0">
    <button ref={triggerRef} type="button" onClick={() => { setRequested(true); setIsOpen((open) => !open); }} className="group relative inline-flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" aria-expanded={isOpen} aria-haspopup="dialog" aria-label={t("editProfilePhoto")}>
      <UserAvatar imageUrl={currentAvatarUrl} name={props.fullName} size="header" decorative />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="size-4" aria-hidden="true" /></span>
    </button>
    <Suspense fallback={isOpen ? <ProfileEditorLoading onClose={closeDialog} /> : null}>
      {requested ? <ProfileEditorDialog {...props} avatarUrl={currentAvatarUrl} isOpen={isOpen} googleCalendarResult={googleCalendarResult} onClose={closeDialog} onAvatarChanged={setCurrentAvatarUrl} returnFocusRef={triggerRef} /> : null}
    </Suspense>
  </span>;
}

function ProfileEditorLoading({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Common");
  useEffect(() => {
    function cancelOpen(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", cancelOpen);
    return () => document.removeEventListener("keydown", cancelOpen);
  }, [onClose]);
  return <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /><span className="sr-only">{t("loading")}</span></span>;
}
