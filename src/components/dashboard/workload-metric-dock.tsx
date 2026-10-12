"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { parseMotionPreference } from "@/lib/motion";

type MotionValue = { value: number; target: number };
type Metric = {
  element: HTMLElement;
  content: HTMLElement;
  active: boolean;
  center: number;
  width: number;
  top: number;
  height: number;
  maxScale: number;
  scale: MotionValue;
  setScale: (value: number) => void;
};

const motionValue = (value: number): MotionValue => ({ value, target: value });
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function follow(state: MotionValue, delta: number, response: number) {
  state.value += (state.target - state.value) * (1 - Math.exp(-delta / response));
  if (Math.abs(state.target - state.value) < 0.001) state.value = state.target;
}

export function WorkloadMetricContent({ children }: { children: ReactNode }) {
  return <span data-metric-content aria-hidden="true" className="pointer-events-none relative inline-flex items-center justify-center whitespace-nowrap">
    {/* The natural-size copy reserves layout; the visible copy supplies a higher-resolution texture. */}
    <span className="invisible inline-flex items-center gap-1">{children}</span>
    <span data-metric-visual className="absolute left-1/2 top-1/2 inline-flex items-center gap-2 text-[2em] leading-[2lh] [&_svg]:size-8" style={{ transform: "translate(-50%, -50%) scale(0.5)" }}>{children}</span>
  </span>;
}

/** Stable hit areas with one traveling lens; only the inner metric groups magnify. */
export function WorkloadMetricDock({ children, className }: { children: ReactNode; className: string }) {
  const container = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const current = container.current;
    const currentLens = surface.current;
    const row = current?.parentElement;
    if (!current || !currentLens || !row) return;
    const root = current;
    const lens = currentLens;

    const context = gsap.context(() => {}, root);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionDisabled = () => reduced.matches || parseMotionPreference(document.documentElement.dataset.motion ?? null) === "off";
    let metrics: Metric[] = [];
    let pointer: number | null = null;
    let focused: HTMLElement | null = null;
    let running = false;
    let gap = 0;
    const position = motionValue(0);
    const width = motionValue(40);
    const opacity = motionValue(0);
    let lensTop = 0;

    context.add(() => gsap.set(lens, { x: 0, y: 0, opacity: 0 }));
    const setX = gsap.quickSetter(lens, "x", "px");
    const setY = gsap.quickSetter(lens, "y", "px");
    const setWidth = gsap.quickSetter(lens, "width", "px");
    const setOpacity = gsap.quickSetter(lens, "opacity");

    function paint() {
      const lensWidth = clamp(width.value, 24, root.clientWidth);
      setWidth(lensWidth);
      setX(clamp(position.value - lensWidth / 2, 0, root.clientWidth - lensWidth));
      setY(lensTop);
      setOpacity(clamp(opacity.value, 0, 1));
      metrics.forEach(metric => {
        metric.setScale(clamp(metric.scale.value, 1, metric.maxScale));
      });
    }

    function stop() {
      gsap.ticker.remove(tick);
      running = false;
    }

    function tick(_time: number, delta: number) {
      follow(position, delta / 1000, 0.02);
      follow(width, delta / 1000, 0.035);
      follow(opacity, delta / 1000, 0.025);
      metrics.forEach(metric => {
        follow(metric.scale, delta / 1000, 0.025);
      });
      paint();
      if ([position, width, opacity].every(state => state.value === state.target)
        && metrics.every(metric => metric.scale.value === metric.scale.target)) stop();
    }

    function update() {
      const disabled = motionDisabled();
      const point = pointer ?? metrics.find(metric => metric.element === focused)?.center;
      const nearest = point === undefined ? undefined : metrics.reduce<Metric | undefined>((closest, metric) =>
        !closest || Math.abs(metric.center - point) < Math.abs(closest.center - point) ? metric : closest, undefined);
      const selected = nearest?.active ? nearest : undefined;
      metrics.forEach(metric => {
        const distance = point === undefined ? Infinity : Math.abs(metric.center - point);
        const influence = selected && metric.active ? Math.exp(-4 * (distance / (metric.width + gap)) ** 2) : 0;
        // A narrow spatial falloff makes the hovered metric dominant without a delayed hand-off.
        metric.scale.target = disabled ? 1 : 1 + Math.min(0.34, (metric.maxScale - 1) * 0.85) * influence;
      });
      opacity.target = selected ? 1 : 0;
      if (selected && point !== undefined) {
        position.target = disabled ? selected.center : point;
        width.target = Math.min(selected.width + gap - 2, selected.content.offsetWidth * selected.scale.target + 18);
        lensTop = selected.top + (selected.height - lens.offsetHeight) / 2;
        if (opacity.value === 0) {
          position.value = position.target;
          width.value = width.target * (disabled ? 1 : 0.85);
        }
      }
      if (disabled) {
        stop();
        [position, width, opacity].forEach(state => {
          state.value = state.target;
        });
        metrics.forEach(metric => { metric.scale = motionValue(metric.scale.target); });
        paint();
      } else if (!running) {
        running = true;
        gsap.ticker.add(tick);
      }
    }

    const observed = new WeakSet<HTMLElement>();
    const resize = new ResizeObserver(measure);
    function measure() {
      const previous = new Map(metrics.map(metric => [metric.element, metric]));
      gap = parseFloat(getComputedStyle(root).columnGap) || 0;
      metrics = Array.from(root.querySelectorAll<HTMLElement>("[data-workload-metric]")).flatMap(element => {
        const content = element.querySelector<HTMLElement>("[data-metric-content]");
        const visual = content?.querySelector<HTMLElement>("[data-metric-visual]");
        if (!content || !visual) return [];
        let metric = previous.get(element);
        if (!metric) {
          // Composite a downscaled 2x source: stable contours without enlarging a low-resolution texture.
          const active = element instanceof HTMLButtonElement;
          context.add(() => gsap.set(visual, { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0.5,
            transformOrigin: "center center", force3D: active, willChange: active ? "transform" : "auto" }));
          const setScaleX = gsap.quickSetter(visual, "scaleX");
          const setScaleY = gsap.quickSetter(visual, "scaleY");
          metric = { element, content, active: element instanceof HTMLButtonElement, center: 0, width: 0,
            top: 0, height: 0, maxScale: 1, scale: motionValue(1),
            setScale: value => { setScaleX(value / 2); setScaleY(value / 2); } };
        }
        metric.width = element.offsetWidth;
        metric.center = element.offsetLeft + metric.width / 2;
        metric.top = element.offsetTop;
        metric.height = element.offsetHeight;
        metric.maxScale = Math.max(1, Math.min(1.42, (metric.width + gap - 2) / Math.max(1, content.offsetWidth)));
        if (!observed.has(content)) { resize.observe(content); observed.add(content); }
        return [metric];
      });
      update();
    }

    function move(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      const bounds = root.getBoundingClientRect();
      pointer = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
        ? event.clientX - bounds.left : null;
      update();
    }
    function leave() { pointer = null; update(); }
    function focus(event: FocusEvent) {
      pointer = null;
      focused = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-workload-metric]") : null;
      update();
    }
    function blur(event: FocusEvent) {
      focused = event.relatedTarget instanceof HTMLElement && root.contains(event.relatedTarget)
        ? event.relatedTarget.closest<HTMLElement>("[data-workload-metric]") : null;
      update();
    }
    function hide() {
      if (!document.hidden) return;
      pointer = null;
      focused = null;
      stop();
      opacity.value = opacity.target = 0;
      metrics.forEach(metric => {
        metric.scale = motionValue(1);
      });
      paint();
    }

    // Listen on the employee row so gaps between buttons never interrupt the lens.
    row.addEventListener("pointermove", move);
    row.addEventListener("pointerleave", leave);
    root.addEventListener("focusin", focus);
    root.addEventListener("focusout", blur);
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", hide);
    const preference = new MutationObserver(update);
    preference.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    const contentChanges = new MutationObserver(measure);
    contentChanges.observe(root, { childList: true, subtree: true, characterData: true });
    resize.observe(root);
    measure();

    return () => {
      stop();
      resize.disconnect();
      preference.disconnect();
      contentChanges.disconnect();
      row.removeEventListener("pointermove", move);
      row.removeEventListener("pointerleave", leave);
      root.removeEventListener("focusin", focus);
      root.removeEventListener("focusout", blur);
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", hide);
      context.revert();
    };
  }, []);

  return <div ref={container} data-workload-dock className={className}>
    <div ref={surface} data-workload-lens aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-[42px] rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] opacity-0 [[data-theme=dark]_&]:bg-[var(--ui-surface-strong)]" />
    {children}
  </div>;
}
