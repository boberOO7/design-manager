"use client";

import { useState, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { hexToHsv, hsvToHex, type HsvColor } from "@/lib/feedback-color";
import styles from "./feedback-color-picker.module.css";

export function FeedbackColorPicker({ value, disabled, onChange }: {
  value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const t = useTranslations("Feedback.editor");
  const [selection, setSelection] = useState(() => ({ value, color: hexToHsv(value) }));
  let color = selection.color;
  // Reconcile external HEX edits before rendering, without an effect feeding
  // another state update into the continuous pointer-event stream.
  if (selection.value !== value) {
    color = hexToHsv(value, color);
    setSelection({ value, color });
  }
  function update(next: HsvColor) {
    if (next.h === color.h && next.s === color.s && next.v === color.v) return;
    const hex = hsvToHex(next);
    setSelection({ value: hex === value.toLowerCase() ? value : hex, color: next });
    if (hex !== value.toLowerCase()) onChange(hex);
  }
  function selectPosition(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    update({ ...color, s: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)), v: Math.max(0, Math.min(100, (1 - (event.clientY - bounds.top) / bounds.height) * 100)) });
  }
  return <div className={styles.picker}>
    <div className={styles.plane} role="group" aria-label={t("accentPalette")} style={{ backgroundColor: `hsl(${color.h} 100% 50%)` }}
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.querySelector("input")?.focus({ preventScroll: true });
        selectPosition(event);
      }}
      onPointerMove={event => { if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) selectPosition(event); }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
      <span className={styles.cursor} aria-hidden style={{ left: `${color.s}%`, top: `${100 - color.v}%`, backgroundColor: value }} />
      <input className="sr-only" type="range" min={0} max={100} step={1} value={color.s} disabled={disabled} aria-label={t("saturation")} aria-valuetext={`${Math.round(color.s)}%`} onChange={event => update({ ...color, s: Number(event.target.value) })} />
      <input className="sr-only" type="range" min={0} max={100} step={1} value={color.v} disabled={disabled} aria-label={t("brightness")} aria-valuetext={`${Math.round(color.v)}%`} onChange={event => update({ ...color, v: Number(event.target.value) })} />
    </div>
    <label className={styles.hueLabel}><span>{t("hue")}</span><input className={styles.hue} type="range" min={0} max={360} step={1} value={color.h} disabled={disabled} aria-label={t("hue")} aria-valuetext={`${Math.round(color.h)}°`} onChange={event => update({ ...color, h: Number(event.target.value) })} /></label>
  </div>;
}
