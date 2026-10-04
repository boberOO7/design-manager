"use client";

import { Settings2 } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ProfileEditorLoading } from "@/components/layout/profile-avatar-editor";
import type { StudioMemberProfileEditorProps } from "./studio-member-profile-editor";

const StudioMemberProfileEditor = lazy(() => import("./studio-member-profile-editor").then((module) => ({ default: module.StudioMemberProfileEditor })));

export function StudioMemberProfileSettings(props: Omit<StudioMemberProfileEditorProps, "isOpen" | "onRequestClose" | "onExited" | "returnFocusRef">) {
  const t = useTranslations("Account");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [requested, setRequested] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  return <span className="relative inline-flex shrink-0">
    <Button ref={triggerRef} aria-expanded={isOpen} aria-haspopup="dialog" className="gap-2 px-2 font-medium text-[var(--ui-text-muted)]" onClick={() => { setRequested(true); setIsOpen(true); }} type="button" variant="ghost"><Settings2 aria-hidden="true" className="size-4" />{t("profileSettings")}</Button>
    <Suspense fallback={isOpen ? <ProfileEditorLoading onClose={() => { setIsOpen(false); setRequested(false); }} /> : null}>{requested ? <StudioMemberProfileEditor {...props} isOpen={isOpen} onRequestClose={() => setIsOpen(false)} onExited={() => setRequested(false)} returnFocusRef={triggerRef} /> : null}</Suspense>
  </span>;
}
