"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";

export function Tooltip({ children, content, onlyWhenTruncated, openOnClick = false }: {
  children: ReactElement;
  content: ReactNode;
  onlyWhenTruncated?: string;
  openOnClick?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const visible = open && Boolean(content);

  useEffect(() => {
    if (!visible) return;
    // Dialogs capture Escape; dismiss the tooltip before closing its parent surface.
    function dismiss(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
    window.addEventListener("keydown", dismiss, true);
    return () => window.removeEventListener("keydown", dismiss, true);
  }, [visible]);

  function changeOpen(nextOpen: boolean) {
    const label = onlyWhenTruncated ? trigger?.querySelector<HTMLElement>(onlyWhenTruncated) : null;
    setOpen(nextOpen && Boolean(content) && (!onlyWhenTruncated || Boolean(label && label.scrollWidth > label.clientWidth)));
  }

  return <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={0}>
    <TooltipPrimitive.Root open={visible} onOpenChange={changeOpen}>
      <TooltipPrimitive.Trigger asChild ref={setTrigger} onClick={openOnClick ? (event) => { event.preventDefault(); changeOpen(true); } : undefined}>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal container={trigger?.closest("dialog") ?? undefined}>
        <TooltipPrimitive.Content sideOffset={6} collisionPadding={8} className="ui-tooltip z-[100] max-h-[var(--radix-tooltip-content-available-height)] max-w-[min(20rem,var(--radix-tooltip-content-available-width))] overflow-y-auto whitespace-pre-line break-words rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-2.5 py-1.5 text-xs font-normal normal-case leading-5 tracking-normal text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>;
}
