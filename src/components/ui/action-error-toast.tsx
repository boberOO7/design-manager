"use client";

import { CircleAlert, X } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

function subscribe() { return () => {}; }
function getPortalTarget() { return document.body; }
function getServerPortalTarget() { return null; }

export function ActionErrorToast({ message, dismissLabel, onDismiss }: { message: string; dismissLabel: string; onDismiss: () => void }) {
  const portalTarget = useSyncExternalStore(subscribe, getPortalTarget, getServerPortalTarget);
  const [closing, setClosing] = useState(false);
  const [paused, setPaused] = useState(false);
  const startDismiss = useCallback(() => setClosing(true), []);
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    if (paused || closing) return;
    const timeout = window.setTimeout(startDismiss, 5000);
    return () => window.clearTimeout(timeout);
  }, [paused, closing, startDismiss]);
  useEffect(() => {
    if (!closing) return;
    const timeout = window.setTimeout(() => dismiss(), 160);
    return () => window.clearTimeout(timeout);
  }, [closing]);
  if (!portalTarget) return null;
  return createPortal(<div role="alert" aria-atomic="true" onMouseEnter={() => setPaused(true)} onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) setPaused(false); }} onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) setPaused(false); }} className={`notification-toast fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[90] flex items-start gap-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] py-4 pl-4 pr-14 text-sm leading-5 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)] motion-reduce:animate-none sm:left-auto sm:right-6 sm:w-96 ${closing ? "notification-toast--closing" : ""}`}>
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]"><CircleAlert aria-hidden="true" className="size-4" /></span>
    <p className="min-w-0 self-center break-words">{message}</p>
    <button type="button" onClick={startDismiss} aria-label={dismissLabel} className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X aria-hidden="true" className="size-4" /></button>
  </div>, portalTarget);
}
