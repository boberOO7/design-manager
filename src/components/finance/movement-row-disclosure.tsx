"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatedFormContent } from "@/components/ui/animated-form-content";

export function MovementRowDisclosure({ label, summary, summaryClassName, description, context, children }: {
  label: string;
  summary: ReactNode;
  summaryClassName: string;
  description: string | null;
  context: string;
  children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState({ description: false, context: false });
  const measure = useCallback(() => {
    const title = trigger.current?.querySelector<HTMLElement>("[data-movement-title]");
    const subtitle = trigger.current?.querySelector<HTMLElement>("[data-movement-context]");
    const next = {
      description: Boolean(description?.includes("\n") || (title && title.scrollWidth > title.clientWidth)),
      context: Boolean(subtitle && subtitle.scrollWidth > subtitle.clientWidth),
    };
    setClipped(previous => previous.description === next.description && previous.context === next.context ? previous : next);
  }, [description, context]);
  useEffect(() => {
    if (!open || !trigger.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(trigger.current);
    return () => observer.disconnect();
  }, [open, measure]);
  return <div className="group" data-state={open ? "open" : "closed"} data-movement-row>
    <button ref={trigger} id={`${id}-trigger`} type="button" aria-label={label} aria-expanded={open} aria-controls={id} className={`w-full text-left ${summaryClassName}`} onClick={() => { measure(); setOpen(!open); }}>{summary}</button>
    <AnimatedFormContent id={id} labelledBy={`${id}-trigger`} isOpen={open}>
      <div className="space-y-3 border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-4 py-3 text-sm">
        {clipped.description && description ? <p data-movement-full-description className="max-w-4xl whitespace-pre-wrap break-words leading-6">{description}</p> : null}
        {clipped.context && context ? <p data-movement-full-context className="max-w-4xl whitespace-pre-wrap break-words leading-6 text-[var(--ui-text-secondary)]">{context}</p> : null}
        {children}
      </div>
    </AnimatedFormContent>
  </div>;
}
