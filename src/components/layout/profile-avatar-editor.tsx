"use client";

import { Settings2, LoaderCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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

export function ProfileAvatarEditor({ mode = "settings", ...props }: ProfileAvatarEditorProps & { mode?: "settings" | "callback" }) {
  const t = useTranslations("Account");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [requested, setRequested] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [googleCalendarResult, setGoogleCalendarResult] = useState<string | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(props.avatarUrl);

  useEffect(() => setCurrentAvatarUrl(props.avatarUrl), [props.avatarUrl]);

  useEffect(() => {
    if (mode !== "callback") return;
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
  }, [mode]);

  function closeDialog() {
    setIsOpen(false);
  }

  return <span className="relative inline-flex shrink-0">
    {mode === "settings" ? <Button ref={triggerRef} type="button" variant="outline" onClick={() => { setRequested(true); setIsOpen((open) => !open); }} aria-expanded={isOpen} aria-haspopup="dialog" className="gap-2"><Settings2 className="size-4" aria-hidden="true" />{t("profileSettings")}</Button> : null}
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
  return <span className="pointer-events-none absolute inset-y-0 -right-7 flex items-center text-[var(--ui-text-muted)]" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /><span className="sr-only">{t("loading")}</span></span>;
}
