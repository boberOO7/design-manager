"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useEffectEvent, useId, useRef } from "react";
import { cn } from "@/lib/utils";

export const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function getDrawerTabFocusTarget({ activeElement, focusable, shiftKey, panel }: { activeElement: Element | null; focusable: HTMLElement[]; shiftKey: boolean; panel: HTMLElement }) {
  if (!focusable.length) return panel;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
}

export function Drawer({ children, className, description, focusKey, initialFocusRef, isOpen, onClose, returnFocusRef, side = "right", title }: { children: ReactNode; className?: string; description?: string; focusKey?: string | number; initialFocusRef?: RefObject<HTMLElement | null>; isOpen: boolean; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null>; side?: "left" | "right"; title: string }) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const requestClose = useEffectEvent(onClose);
  const getFocusElements = useEffectEvent(() => ({
    initial: initialFocusRef?.current ?? panelRef.current,
    returnTo: returnFocusRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
  }));

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const { initial: initialFocusElement, returnTo: returnFocusElement } = getFocusElements();
    document.body.style.overflow = "hidden";
    initialFocusElement?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      const target = getDrawerTabFocusTarget({ activeElement: document.activeElement, focusable, shiftKey: event.shiftKey, panel });
      if (target) {
        event.preventDefault();
        target.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusElement?.focus();
    };
  }, [focusKey, isOpen]);

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 bg-stone-950/45" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" role="dialog" tabIndex={-1} className={cn("absolute top-0 flex h-dvh w-[min(22rem,calc(100%-1rem))] flex-col bg-[var(--ui-surface)] shadow-2xl outline-none", side === "left" ? "left-0 rounded-r-[var(--ui-radius-drawer)]" : "right-0 rounded-l-[var(--ui-radius-drawer)]", className)}>
      <h2 id={titleId} className="sr-only">{title}</h2>
      {description ? <p id={descriptionId} className="sr-only">{description}</p> : null}
      {children}
    </section>
  </div>;
}
