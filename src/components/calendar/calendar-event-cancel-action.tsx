"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";

const HOLD_MS = 900;

export function CalendarEventCancelAction({ disabled, occurrence, onConfirm }: {
  disabled: boolean;
  occurrence: boolean;
  onConfirm: (scope: "this" | "series") => void;
}) {
  const t = useTranslations("Calendar");
  const hintId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<"pointer" | "keyboard" | null>(null);
  const [holding, setHolding] = useState(false);
  const [scope, setScope] = useState<"this" | "series">("this");

  function stop() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    input.current = null;
    setHolding(false);
  }

  function start(source: "pointer" | "keyboard") {
    if (disabled || input.current) return;
    input.current = source;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      input.current = null;
      setHolding(false);
      onConfirm(occurrence ? scope : "series");
    }, HOLD_MS);
  }

  useEffect(() => {
    function interrupt() {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      input.current = null;
      setHolding(false);
    }
    function keyDown(event: KeyboardEvent) { if (event.key === "Escape") interrupt(); }
    function visibility() { if (document.hidden) interrupt(); }
    interrupt();
    window.addEventListener("blur", interrupt);
    window.addEventListener("keydown", keyDown);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      input.current = null;
      window.removeEventListener("blur", interrupt);
      window.removeEventListener("keydown", keyDown);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [disabled, occurrence, scope]);

  return <div className="flex min-w-0 flex-wrap items-center gap-1">
    {occurrence ? <Select aria-label={t("cancelEventScope")} value={scope} disabled={disabled || holding} onValueChange={(value) => { if (value === "this" || value === "series") setScope(value); }} className="mr-1 w-44"><SelectItem value="this">{t("cancelOnlyOccurrence")}</SelectItem><SelectItem value="series">{t("cancelEntireSeries")}</SelectItem></Select> : null}
    <Button type="button" variant="outline" disabled={disabled} aria-describedby={hintId} className="calendar-cancel-hold relative isolate overflow-hidden touch-pan-y select-none" data-holding={holding || undefined}
      onPointerDown={(event) => { if (event.button !== 0 || !event.isPrimary) return; event.currentTarget.setPointerCapture(event.pointerId); start("pointer"); }}
      onPointerMove={(event) => { if (input.current !== "pointer") return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) stop(); }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
      onKeyDown={(event) => { if (event.key !== " " && event.key !== "Enter") return; event.preventDefault(); if (!event.repeat) start("keyboard"); }}
      onKeyUp={(event) => { if (event.key !== " " && event.key !== "Enter") return; event.preventDefault(); if (input.current === "keyboard") stop(); }}>
      <span aria-hidden="true" className="calendar-cancel-fill pointer-events-none absolute inset-0 -z-10 origin-left bg-[var(--ui-danger-surface)]" style={{ transform: `scaleX(${holding ? 1 : 0})`, transition: holding ? `transform ${HOLD_MS}ms linear` : "none" }} />
      {t("cancelEvent")}
    </Button>
    <span id={hintId} className="sr-only">{t("cancelEventHoldHint")}</span>
    <Tooltip content={t("cancelEventHoldHint")} openOnClick><button type="button" aria-label={t("cancelEventHelpLabel")} className="inline-flex size-8 shrink-0 items-center justify-center rounded text-[var(--ui-text-muted)] transition-colors duration-150 hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] motion-reduce:transition-none"><Info aria-hidden="true" className="size-4" /></button></Tooltip>
  </div>;
}
