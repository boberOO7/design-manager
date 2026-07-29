"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Drawer({ children, className, description, initialFocusRef, isOpen, onClose, returnFocusRef, side = "right", title }: { children: ReactNode; className?: string; description?: string; initialFocusRef?: RefObject<HTMLElement | null>; isOpen: boolean; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null>; side?: "left" | "right"; title: string }) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef?.current;
    document.body.style.overflow = "hidden";
    (initialFocusRef?.current ?? panelRef.current)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusElement?.focus();
    };
  }, [initialFocusRef, isOpen, onClose, returnFocusRef]);

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 bg-stone-950/45" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" role="dialog" tabIndex={-1} className={cn("absolute top-0 flex h-dvh w-[min(22rem,calc(100%-1rem))] flex-col bg-[var(--ui-surface)] shadow-2xl outline-none", side === "left" ? "left-0 rounded-r-[var(--ui-radius-drawer)]" : "right-0 rounded-l-[var(--ui-radius-drawer)]", className)}>
      <h2 id={titleId} className="sr-only">{title}</h2>
      {description ? <p id={descriptionId} className="sr-only">{description}</p> : null}
      {children}
    </section>
  </div>;
}
