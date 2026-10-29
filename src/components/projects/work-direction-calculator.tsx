"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { equivalentArea } from "@/lib/work-directions";
import styles from "./work-directions.module.css";

function AnimatedArea({ value, locale }: { value: number | null; locale: string }) {
  const [shown, setShown] = useState(value ?? 0);
  const current = useRef(value ?? 0);
  useEffect(() => {
    const target = value ?? 0;
    if (document.documentElement.dataset.motion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = target; setShown(target); return;
    }
    const start = performance.now(), from = current.current;
    let frame = 0;
    function tick(time: number) {
      const progress = Math.min(Math.max((time - start) / 200, 0), 1);
      current.current = from + (target - from) * (1 - (1 - progress) ** 3);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span aria-hidden="true">{value === null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(shown)}</span>;
}

export function WorkDirectionCalculator({ area, coefficient, onAreaChange, onCoefficientChange, disabled = false, recommendedMin, recommendedMax, onResetCoefficient, resetDisabled }: {
  area: string; coefficient: string; onAreaChange: (value: string) => void; onCoefficientChange: (value: string) => void; disabled?: boolean;
  recommendedMin?: number | null; recommendedMax?: number | null;
  onResetCoefficient?: () => void; resetDisabled?: boolean;
}) {
  const t = useTranslations("ProjectWorkspace.directions"), locale = useLocale();
  const coefficientId = useId(), guidanceId = useId();
  const numericArea = Number(area.replace(",", ".")), numericCoefficient = Number(coefficient.replace(",", "."));
  const result = equivalentArea(numericArea, numericCoefficient);
  const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const formatCoefficient = (value: number) => new Intl.NumberFormat(locale, { maximumSignificantDigits: 12 }).format(value);
  const hasGuidance = recommendedMin != null && recommendedMax != null;
  const enteredCoefficient = Number.isFinite(numericCoefficient) && numericCoefficient > 0 ? numericCoefficient : 1;
  const sliderMin = hasGuidance ? Math.min(recommendedMin, enteredCoefficient) : 0.01;
  const sliderMax = Math.max(hasGuidance ? recommendedMax : 2, enteredCoefficient);
  const sliderSpan = sliderMax - sliderMin;
  const position = (value: number) => (value - sliderMin) / sliderSpan * 100;
  // Use readable decimal intervals, including both endpoints for custom studio ranges.
  const magnitude = 10 ** Math.floor(Math.log10(sliderSpan / 4));
  const tickStep = ([1, 2, 5, 10].find(step => step * magnitude >= sliderSpan / 4) ?? 10) * magnitude;
  const ticks = [sliderMin];
  for (let index = Math.ceil(sliderMin / tickStep); index * tickStep < sliderMax; index++) {
    const value = Number((index * tickStep).toPrecision(12));
    if (value - sliderMin >= tickStep * 0.5 && sliderMax - value >= tickStep * 0.5) ticks.push(value);
  }
  ticks.push(sliderMax);
  const outsideGuidance = hasGuidance && (numericCoefficient < recommendedMin || numericCoefficient > recommendedMax);
  return <section aria-label={t("calculator")} className={styles.calculator}>
    <div className={styles.calculatorEquation}>
      <label className="grid min-w-0 gap-1.5 text-xs text-[var(--ui-text-secondary)]">{t("area")}<div className="relative"><Input aria-label={t("area")} name="directionArea" type="number" min="0" step="any" required inputMode="decimal" value={area} disabled={disabled} onChange={event => onAreaChange(event.target.value)} className="ui-numeric pr-9 text-base font-medium"/><span className="pointer-events-none absolute right-3 top-3 text-xs text-[var(--ui-text-muted)]">м²</span></div></label>
      <ArrowRight aria-hidden="true" className="mb-3.5 size-4 text-[var(--ui-text-muted)]"/>
      <div className={styles.calculatorResult}>
        <p className="text-xs text-[var(--ui-text-secondary)]">{t("equivalent")}</p>
        <output aria-label={t("equivalent")} aria-live="off" className={styles.calculatorOutput}><span className="sr-only">{result === null ? t("invalid") : format(result)}</span><AnimatedArea value={result} locale={locale}/><span aria-hidden="true" className="text-xs font-normal tracking-normal text-[var(--ui-text-muted)]">{t("unitShort")}</span></output>
      </div>
    </div>
    <div className={styles.coefficientControl}>
      <div className={styles.coefficientHeading}>
        <div className="min-w-0"><label htmlFor={coefficientId} className="text-sm font-medium">{t("coefficient")}</label><p id={guidanceId} className="mt-1 text-xs text-[var(--ui-text-muted)]">{hasGuidance ? t("recommendedRange", { min: formatCoefficient(recommendedMin), max: formatCoefficient(recommendedMax) }) : t("noGuidance")}</p></div>
        <div className={styles.coefficientInput}><span aria-hidden="true">×</span><Input id={coefficientId} aria-label={t("coefficient")} aria-describedby={guidanceId} name="directionCoefficient" type="number" min="0" step="any" required inputMode="decimal" value={coefficient} disabled={disabled} onChange={event => onCoefficientChange(event.target.value)} className="ui-numeric pl-6 text-base font-semibold"/></div>
        {onResetCoefficient ? <Button type="button" variant="ghost" className="size-10 shrink-0 p-0" aria-label={t("resetCoefficient")} title={t("resetCoefficient")} disabled={disabled || resetDisabled} onClick={onResetCoefficient}><RotateCcw aria-hidden="true" className="size-4"/></Button> : null}
      </div>
      <div className={styles.sliderWrap}>
        <div aria-hidden="true" className={styles.sliderRail}><span className={styles.sliderTrack}/>{hasGuidance ? <span className={styles.recommendedBand} style={{ left: `${position(recommendedMin)}%`, width: `${(recommendedMax - recommendedMin) / sliderSpan * 100}%` }}/> : null}<span className={styles.sliderFill} style={{ transform: `scaleX(${position(enteredCoefficient) / 100})` }}/></div>
        <input className={styles.slider} type="range" aria-label={t("coefficientSlider")} aria-describedby={guidanceId} min={sliderMin} max={sliderMax} step="0.01" value={enteredCoefficient} disabled={disabled} onChange={event => onCoefficientChange(event.target.value)} aria-valuetext={formatCoefficient(enteredCoefficient)}/>
        <div aria-hidden="true" className={styles.sliderTicks}>{ticks.map((value, index) => <span key={value} data-edge={index === 0 ? "start" : index === ticks.length - 1 ? "end" : undefined} style={{ left: `${position(value)}%` }}>{formatCoefficient(value)}</span>)}</div>
      </div>
      <p className={styles.coefficientHint} aria-live="polite">{outsideGuidance ? t("outsideGuidance") : "\u00a0"}</p>
    </div>
  </section>;
}
