"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { parseMotionPreference } from "@/lib/motion";
import type { StatisticsPeriod, StatisticsSection } from "@/lib/statistics";

/** One clock for the structural reveal and its plots; no chart remounts to replay. */
export function StatisticsMotion({ section, period, children }: {
  section: StatisticsSection; period: StatisticsPeriod; children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const disabled = () => {
      const preference = parseMotionPreference(document.documentElement.dataset.motion ?? null);
      return preference === "off" || (preference === "system" && reduced.matches);
    };
    let context: gsap.Context | undefined;
    let timeline: gsap.core.Timeline | undefined;
    let registerChart: (svg: SVGSVGElement) => void = () => {};

    if (!disabled()) {
      root.dataset.statisticsMotion = "pending";
      context = gsap.context(() => {
        const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-statistics-reveal]"))
          .map(element => ({ element, box: element.getBoundingClientRect() }))
          .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
        const starts = new Map(cards.map(({ element }, index) => [element, index * 0.24]));
        const registered = new WeakSet<SVGSVGElement>();
        const sequence = gsap.timeline({ onComplete: () => { root.dataset.statisticsMotion = "complete"; } });
        timeline = sequence;

        cards.forEach(({ element }) => {
          const start = starts.get(element) ?? 0;
          sequence.fromTo(element, { clipPath: "inset(0% 0% 100% 0%)" }, {
            clipPath: "inset(0% 0% 0% 0%)", duration: 0.56, ease: "power2.inOut", clearProps: "clipPath",
          }, start);
          const fills = element.querySelectorAll<HTMLElement>("[data-statistics-progress]");
          if (fills.length) sequence.fromTo(fills, { scaleX: 0, transformOrigin: "left center" }, {
            scaleX: 1, duration: 0.64, ease: "power2.out", clearProps: "transform,transformOrigin",
          }, start + 0.42);
        });

        registerChart = svg => {
          const card = svg.closest<HTMLElement>("[data-statistics-reveal]");
          if (!card || registered.has(svg)) return;
          const bars = svg.querySelectorAll<SVGGElement>("[data-statistics-bar]");
          const lines = Array.from(svg.querySelectorAll<SVGPathElement>("[data-statistics-line]"));
          if (!bars.length && !lines.length) return; // The measured plot may arrive in a nested layout effect.
          registered.add(svg);
          const start = (starts.get(card) ?? 0) + 0.42;
          if (bars.length) sequence.fromTo(bars, {
            scaleY: 0, svgOrigin: `0 ${svg.dataset.statisticsBaseline}`,
          }, {
            scaleY: 1, duration: 0.62, stagger: { amount: 0.16 }, ease: "power2.out",
            clearProps: "transform,transformOrigin",
          }, start);
          if (lines.length) {
            const lengths = lines.map(line => line.getTotalLength());
            const total = lengths.reduce((sum, length) => sum + length, 0);
            let drawn = 0;
            // SVG dashes restart at each subpath. Draw separate runs in order, preserving evidence gaps.
            lines.forEach((line, index) => {
              const length = lengths[index];
              if (length > 0) sequence.fromTo(line, { strokeDasharray: length, strokeDashoffset: length }, {
                strokeDashoffset: 0, duration: 0.78 * length / total, ease: "none", clearProps: "strokeDasharray,strokeDashoffset",
              }, start + 0.78 * drawn / total);
              drawn += length;
            });
            svg.querySelectorAll<SVGCircleElement>("[data-statistics-dot]").forEach(dot => {
              sequence.fromTo(dot, { scale: 0, svgOrigin: `${dot.getAttribute("cx")} ${dot.getAttribute("cy")}` }, {
                scale: 1, duration: 0.16, ease: "power2.out", clearProps: "transform,transformOrigin",
              }, start + Number(dot.dataset.statisticsDot) * 0.78);
            });
          }
        };
        root.querySelectorAll<SVGSVGElement>("svg[data-statistics-baseline]").forEach(registerChart);
        root.dataset.statisticsMotion = "running";
      }, root);
    } else root.dataset.statisticsMotion = "complete";

    // Charts reserve their final height on the server and announce measured SVGs before paint.
    const chartReady = (event: Event) => {
      const svg = event.target;
      if (svg instanceof SVGSVGElement && context) context.add(() => registerChart(svg));
    };
    const finish = () => timeline?.progress(1);
    const preferenceChanged = () => {
      if (!disabled()) return;
      context?.revert();
      context = undefined;
      timeline = undefined;
      root.dataset.statisticsMotion = "complete";
    };
    const observer = new MutationObserver(preferenceChanged);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    reduced.addEventListener("change", preferenceChanged);
    root.addEventListener("statistics-chart-ready", chartReady);
    root.addEventListener("focusin", finish);
    root.addEventListener("pointerdown", finish);
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", preferenceChanged);
      root.removeEventListener("statistics-chart-ready", chartReady);
      root.removeEventListener("focusin", finish);
      root.removeEventListener("pointerdown", finish);
      context?.revert();
    };
  }, [section, period]);

  return <div ref={container} data-statistics-motion="pending" className="statistics-tab-content min-w-0 space-y-4">
    <noscript><style>{".statistics-tab-content [data-statistics-reveal] { clip-path: none !important; }"}</style></noscript>
    {children}
  </div>;
}
