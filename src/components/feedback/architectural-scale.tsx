"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { gsap } from "gsap";
import styles from "./client-survey.module.css";

type ActivePointer = { id: number; x: number; y: number; left: number; width: number; offset: number; dragging: boolean };

export function ArchitecturalScale({ name, value, disabled, required = true, onChange }: {
  name: string;
  required?: boolean;
  value: number | undefined;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("Feedback");
  const nps = name === "recommendation";
  const min = nps ? 0 : 1;
  const max = nps ? 10 : 5;
  const count = max - min + 1;
  const subdivisions = nps ? 4 : 8;
  const values = Array.from({ length: count }, (_, index) => min + index);
  const pointer = useRef<ActivePointer | null>(null);
  const scaleRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [animatedPosition, setAnimatedPosition] = useState<number | null>(null);
  const [railWidth, setRailWidth] = useState(0);
  const dragging = dragPosition !== null;
  const position = dragPosition ?? animatedPosition ?? (value === undefined ? 0 : (value - min) / (max - min));
  const displayValue = value === undefined && !dragging ? undefined : values.findLast(option => (option - min) / (max - min) <= position);
  const scaleStyle: CSSProperties & { "--scale-count": number } = { "--scale-count": count };

  useEffect(() => {
    const scale = scaleRef.current;
    const rail = railRef.current;
    if (!scale || !rail) return;
    const observer = new ResizeObserver(([entry]) => setRailWidth(entry.contentRect.width));
    observer.observe(rail);
    // A horizontal browser pan can otherwise consume the next tap after dragging.
    const preventHorizontalPan = (event: TouchEvent) => {
      if (pointer.current?.dragging && event.cancelable) event.preventDefault();
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finishMotion = () => {
      if (!reducedMotion.matches) return;
      tweenRef.current?.kill();
      setAnimatedPosition(null);
    };
    scale.addEventListener("touchmove", preventHorizontalPan, { passive: false });
    reducedMotion.addEventListener("change", finishMotion);
    return () => {
      observer.disconnect();
      scale.removeEventListener("touchmove", preventHorizontalPan);
      reducedMotion.removeEventListener("change", finishMotion);
      tweenRef.current?.kill();
    };
  }, []);

  function settleTo(target: number) {
    tweenRef.current?.kill();
    if (target === position || (value === undefined && !dragging) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimatedPosition(null);
      return;
    }
    // One rendered position drives the handle, lights and numbers through the entire snap.
    const motion = { position };
    setAnimatedPosition(position);
    tweenRef.current = gsap.to(motion, {
      position: target, duration: .2, ease: "power3.out",
      onUpdate: () => setAnimatedPosition(motion.position),
      onComplete: () => setAnimatedPosition(null),
    });
  }

  function pointerPosition(clientX: number, active: ActivePointer) {
    return Math.max(0, Math.min(1, (clientX - active.left - (active.dragging ? active.offset : 0)) / active.width));
  }
  function finishPointer(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    pointer.current = null;
    setDragPosition(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (commit && !disabled) {
      const next = min + Math.round(pointerPosition(event.clientX, active) * (max - min));
      settleTo((next - min) / (max - min));
      onChange(next);
      if (event.pointerType !== "touch") event.currentTarget.querySelector<HTMLInputElement>(`input[value="${next}"]`)?.focus({ preventScroll: true });
    } else settleTo(value === undefined ? 0 : (value - min) / (max - min));
  }

  return <div className={styles.ratingControl} data-feedback-scale={name}>
    <p id={`${name}-hint`} className="sr-only">{t(nps ? "npsHint" : "ratingHint")} {t("scaleInteractionHint")}</p>
    <div className={styles.scaleReadout}>
      <div className={styles.scaleState} role="status" aria-live={dragging ? "off" : "polite"} aria-atomic="true" data-selected={displayValue !== undefined}>
        <span>{displayValue === undefined ? t("chooseRating") : t(`${nps ? "npsStates" : "ratingStates"}.${displayValue}`)}</span>
        <span className="sr-only">{displayValue === undefined ? "" : ` · ${t("ratingOption", { value: displayValue, max })}`}</span>
      </div>
      <div className={styles.scaleValue} aria-hidden="true">{displayValue ?? "—"}<span>/ {max}</span></div>
    </div>
    <div ref={scaleRef} className={styles.scale} style={scaleStyle} data-dragging={dragging} data-moving={dragging || animatedPosition !== null} data-selected={displayValue !== undefined}
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        const rail = railRef.current?.getBoundingClientRect();
        if (!rail?.width) return;
        const marker = markerRef.current?.getBoundingClientRect();
        const grabbedMarker = value !== undefined && marker && Math.abs(event.clientX - (marker.left + marker.width / 2)) <= marker.width / 2 + 8 && Math.abs(event.clientY - (marker.top + marker.height / 2)) <= marker.height / 2 + 8;
        // Keep the grab offset, including when a new drag interrupts a settling marker.
        pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rail.left, width: rail.width, offset: grabbedMarker ? event.clientX - (marker.left + marker.width / 2) : 0, dragging: false };
        tweenRef.current?.kill();
        setAnimatedPosition(position);
        if (grabbedMarker) setDragPosition(Math.max(0, Math.min(1, (marker.left + marker.width / 2 - rail.left) / rail.width)));
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const active = pointer.current;
        if (!active || active.id !== event.pointerId || disabled) return;
        if (!active.dragging) {
          const horizontal = Math.abs(event.clientX - active.x);
          const vertical = Math.abs(event.clientY - active.y);
          // Leave vertical gestures to the page, without accidentally answering.
          if (vertical > horizontal && vertical > 6) { finishPointer(event, false); return; }
          if (horizontal < 6) return;
          active.dragging = true;
        }
        // Only this scale renders during drag; the form receives one integer on release.
        setDragPosition(pointerPosition(event.clientX, active));
      }}
      onPointerUp={event => finishPointer(event, true)}
      onPointerCancel={event => finishPointer(event, false)}
      onLostPointerCapture={event => finishPointer(event, false)}
      // Pointer release owns selection; its synthesized click must not select again.
      onClickCapture={event => { if (event.detail > 0) event.preventDefault(); }}
      onKeyDown={event => {
        if (event.key !== "Escape" || !pointer.current) return;
        const id = pointer.current.id;
        pointer.current = null;
        tweenRef.current?.kill();
        setDragPosition(null);
        setAnimatedPosition(null);
        if (event.currentTarget.hasPointerCapture(id)) event.currentTarget.releasePointerCapture(id);
      }}>
      <div ref={railRef} className={styles.scaleRail} aria-hidden="true">
        <div className={styles.minorTicks}>{Array.from({ length: (count - 1) * subdivisions + 1 }, (_, index) => <i key={index} data-major={index % subdivisions === 0} data-passed={displayValue !== undefined && index / ((count - 1) * subdivisions) <= position} />)}</div>
        <span className={styles.markerTrack} hidden={displayValue === undefined} style={{ left: `${position * 100}%` }}><span ref={markerRef} className={styles.marker} /></span>
      </div>
      <div className={styles.scaleOptions}>{values.map(option => {
        // Use physical distance so the same response fits both 1–5 and mobile NPS.
        const distance = Math.abs((option - min) / (max - min) - position) * railWidth;
        const proximity = displayValue === undefined || railWidth === 0 ? 1 : Math.min(1, distance / 28);
        const tickScale = .25 + .75 * proximity * proximity * (3 - 2 * proximity);
        return <label key={option} className={styles.option} data-active={displayValue === option} data-passed={displayValue !== undefined && (option - min) / (max - min) <= position}>
        <input type="radio" name={name} value={option} required={required} disabled={disabled} checked={value === option} onChange={() => { tweenRef.current?.kill(); setAnimatedPosition(null); onChange(option); }} aria-describedby={`${name}-hint`} aria-label={t("ratingOption", { value: option, max })} />
        <span className={styles.tick} style={{ transform: `scaleY(${tickScale})` }} aria-hidden="true" />
        <span className={styles.optionNumber} aria-hidden="true">{option}</span>
      </label>;
      })}</div>
    </div>
    <div className={styles.endpoints}><span>{t(nps ? "unlikely" : "lowRating")}</span><span>{t(nps ? "veryLikely" : "highRating")}</span></div>
  </div>;
}
