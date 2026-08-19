"use client";

import type { ReactNode, RefObject, TransitionEvent } from "react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
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

export function Drawer({ children, className, description, focusKey, initialFocusRef, isOpen, onClose, onExited, returnFocusRef, side = "right", title }: { children: ReactNode; className?: string; description?: string; focusKey?: string | number; initialFocusRef?: RefObject<HTMLElement | null>; isOpen: boolean; onClose: () => void; onExited?: () => void; returnFocusRef?: RefObject<HTMLElement | null>; side?: "left" | "right"; title: string }) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const isClosingRef = useRef(false);
  const hasExitedRef = useRef(false);
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
    const panel = panelRef.current;
    document.body.style.overflow = "hidden";
    initialFocusElement?.focus();

    function suppressOperationalAutofill() {
      panel?.querySelectorAll("input, textarea").forEach((field) => {
        if (!field.hasAttribute("autocomplete")) field.setAttribute("autocomplete", "off");
      });
    }
    suppressOperationalAutofill();
    const autofillObserver = new MutationObserver(suppressOperationalAutofill);
    if (panel) autofillObserver.observe(panel, { childList: true, subtree: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const currentPanel = panelRef.current;
      if (!currentPanel) return;
      const focusable = Array.from(currentPanel.querySelectorAll<HTMLElement>(focusableSelector));
      const target = getDrawerTabFocusTarget({ activeElement: document.activeElement, focusable, shiftKey: event.shiftKey, panel: currentPanel });
      if (target) {
        event.preventDefault();
        target.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      autofillObserver.disconnect();
      returnFocusElement?.focus();
    };
  }, [focusKey, isOpen]);

  useEffect(() => {
    if (isOpen) {
      isClosingRef.current = false;
      hasExitedRef.current = false;
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    if (!isVisible && !isClosingRef.current) {
      const frame = window.requestAnimationFrame(() => {
        if (hasExitedRef.current) return;
        hasExitedRef.current = true;
        onExited?.();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    isClosingRef.current = true;
    const frame = window.requestAnimationFrame(() => setIsVisible(false));
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, isVisible, onExited]);

  function handlePanelTransitionEnd(event: TransitionEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== "transform" || isOpen) return;
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    onExited?.();
  }

  return <div aria-hidden={!isOpen} inert={!isOpen} className={cn("fixed inset-0 z-50 bg-[var(--ui-overlay)] transition-opacity duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)]", isVisible ? "opacity-100" : "pointer-events-none opacity-0")} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} aria-describedby={description ? descriptionId : undefined} aria-hidden={!isOpen} aria-labelledby={titleId} aria-modal="true" role="dialog" tabIndex={-1} onTransitionEnd={handlePanelTransitionEnd} className={cn("absolute top-0 flex h-dvh w-[min(22rem,calc(100%-1rem))] flex-col bg-[var(--ui-surface)] shadow-2xl outline-none transition-transform duration-[320ms] ease-[cubic-bezier(0.65,0,0.35,1)]", side === "left" ? (isVisible ? "left-0 translate-x-0 rounded-r-[var(--ui-radius-drawer)]" : "left-0 -translate-x-full rounded-r-[var(--ui-radius-drawer)]") : (isVisible ? "right-0 translate-x-0 rounded-l-[var(--ui-radius-drawer)]" : "right-0 translate-x-full rounded-l-[var(--ui-radius-drawer)]"), className)}>
      <h2 id={titleId} className="sr-only">{title}</h2>
      {description ? <p id={descriptionId} className="sr-only">{description}</p> : null}
      {children}
    </section>
  </div>;
}
