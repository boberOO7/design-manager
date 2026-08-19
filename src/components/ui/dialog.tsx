"use client";

import { X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useEffectEvent, useId, useRef } from "react";
import { lockAppScroll, unlockAppScroll } from "@/components/ui/app-scroll-lock";
import { focusableSelector, getDrawerTabFocusTarget } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export type DialogCloseReason = "escape" | "outside" | "explicit";

export function Dialog({ ariaLabel, children, className, closeDisabled = false, closeLabel, description, hideHeader = false, isOpen, onRequestClose, returnFocusRef, title }: {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  closeDisabled?: boolean;
  closeLabel: string;
  description?: string;
  hideHeader?: boolean;
  isOpen: boolean;
  onRequestClose: (reason: DialogCloseReason) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  title?: string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const requestClose = useEffectEvent(onRequestClose);

  useEffect(() => {
    if (!isOpen) return;
    const returnTo = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    lockAppScroll();
    const panel = panelRef.current;
    const initialFocus = panel?.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? panel;
    initialFocus?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose("escape");
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      const target = getDrawerTabFocusTarget({ activeElement: document.activeElement, focusable, shiftKey: event.shiftKey, panel });
      if (target) {
        event.preventDefault();
        target.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      unlockAppScroll();
      document.removeEventListener("keydown", handleKeyDown);
      returnTo?.focus({ preventScroll: true });
    };
  }, [isOpen, returnFocusRef]);

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--ui-overlay)] p-2 sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onRequestClose("outside"); }}>
    <section ref={panelRef} aria-describedby={description ? descriptionId : undefined} aria-label={title ? undefined : ariaLabel} aria-labelledby={title ? titleId : undefined} aria-modal="true" role="dialog" tabIndex={-1} className={cn("flex h-[calc(100dvh-1rem)] w-full max-w-[50rem] flex-col overflow-hidden rounded-[var(--ui-radius-drawer)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] shadow-2xl outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)]", className)}>
      {!hideHeader && title ? <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--ui-border)] px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0"><h2 id={titleId} className="text-lg font-semibold text-[var(--ui-text)]">{title}</h2>{description ? <p id={descriptionId} className="mt-1 text-sm text-[var(--ui-text-muted)]">{description}</p> : null}</div>
        <button type="button" aria-label={closeLabel} disabled={closeDisabled} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onRequestClose("explicit")}><X aria-hidden="true" className="size-5" /></button>
      </header> : null}
      {children}
    </section>
  </div>;
}
