"use client";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Measure the mounted inner content so both toggles and added drives transition
// actual layout height, including inside a height-constrained dialog.
// Clip without a nested scroll container: focusing fields must scroll only the dialog.
// StudioFlow keeps functional transitions in system mode; global Motion off disables them.
export function AnimatedFormContent({ children, isOpen, id, labelledBy }: { children: ReactNode; isOpen: boolean; id?: string; labelledBy?: string }) {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(node.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div id={id} role={id ? "region" : undefined} aria-labelledby={labelledBy} aria-hidden={!isOpen} inert={!isOpen} style={{ height: isOpen ? height : 0 }} className={cn("shrink-0 overflow-clip transition-[height,opacity,visibility] duration-[220ms] ease-out", isOpen ? "opacity-100" : "invisible opacity-0")}><div ref={content} className="flow-root">{children}</div></div>;
}

// Retain form values while closed; invalid fields reopen before receiving focus.
export function AnimatedDisclosure({ children, title, className, open, onOpenChange, defaultOpen = false }: { children: ReactNode; title: string; className?: string; open?: boolean; onOpenChange?: (open: boolean) => void; defaultOpen?: boolean }) {
  const id = useId(), [localOpen, setLocalOpen] = useState(defaultOpen);
  const isOpen = open ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  return <div className={className} onInvalidCapture={(event) => {
    if (isOpen) return;
    event.preventDefault(); setOpen(true);
    const target = event.target;
    if (target instanceof HTMLElement) requestAnimationFrame(() => target.focus());
  }}>
    <button id={`${id}-trigger`} type="button" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(!isOpen)} className="flex min-h-11 w-full items-center gap-2 rounded-[var(--ui-radius-control)] text-left text-sm font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ChevronDown className={cn("size-4 shrink-0 transition-transform duration-[220ms]", isOpen && "rotate-180")} aria-hidden="true" />{title}</button>
    <AnimatedFormContent id={id} labelledBy={`${id}-trigger`} isOpen={isOpen}>{children}</AnimatedFormContent>
  </div>;
}
