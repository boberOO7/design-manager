"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { watchInstaLoadMotion } from "@/components/shared/instaload-reveal";
import type { StatisticsPeriod, StatisticsSection } from "@/lib/statistics";

/** Plots join their streamed scope once, without replaying on effect reconnection. */
export function StatisticsMotion({ section, period, children }: {
  section: StatisticsSection; period: StatisticsPeriod; children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const filled = useRef(new WeakSet<HTMLElement>());
  const registered = useRef(new WeakSet<SVGSVGElement>());

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    let interrupted = false;
    let context: gsap.Context | undefined;
    let registerChart: (svg: SVGSVGElement) => void = () => {};

    const finish = () => { interrupted = true; context?.revert(); context = undefined; root.dataset.statisticsMotion = "complete"; };
    const motion = watchInstaLoadMotion(root, finish);
    if (!motion.disabled()) {
      context = gsap.context(() => {
        const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-statistics-reveal]"))
          .map(element => ({ element, box: element.getBoundingClientRect() }))
          .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
        const starts = new Map(cards.map(({ element }, index) => [element, Math.min(0.1, index * 0.025)]));
        const sequence = gsap.timeline({ onComplete: () => { root.dataset.statisticsMotion = "complete"; } });

        cards.forEach(({ element }) => {
          const start = starts.get(element) ?? 0;
          const fills = Array.from(element.querySelectorAll<HTMLElement>("[data-statistics-progress]")).filter(fill => {
            if (filled.current.has(fill)) return false;
            filled.current.add(fill);
            return true;
          });
          if (fills.length) sequence.fromTo(fills, { scaleX: 0, transformOrigin: "left center" }, {
            scaleX: 1, duration: 0.64, ease: "power2.out", clearProps: "transform,transformOrigin",
          }, start);
        });

        registerChart = svg => {
          const card = svg.closest<HTMLElement>("[data-statistics-reveal]");
          if (!card || registered.current.has(svg)) return;
          const bars = svg.querySelectorAll<SVGGElement>("[data-statistics-bar]");
          const lines = Array.from(svg.querySelectorAll<SVGPathElement>("[data-statistics-line]"));
          if (!bars.length && !lines.length) return; // The measured plot may arrive in a nested layout effect.
          registered.current.add(svg);
          const start = starts.get(card) ?? 0;
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
        root.dataset.statisticsMotion = sequence.duration() ? "running" : "complete";
      }, root);
    } else root.dataset.statisticsMotion = "complete";

    // Charts reserve their final height on the server and announce measured SVGs before paint.
    const chartReady = (event: Event) => {
      const svg = event.target;
      if (svg instanceof SVGSVGElement && context && !motion.disabled() && !interrupted) context.add(() => registerChart(svg));
    };
    root.addEventListener("statistics-chart-ready", chartReady);
    return () => {
      motion.dispose();
      root.removeEventListener("statistics-chart-ready", chartReady);
      context?.revert();
      root.dataset.statisticsMotion = "complete";
    };
  }, [section, period]);

  return <div ref={container} data-statistics-motion="complete" className="statistics-tab-content h-full min-w-0">
    {children}
  </div>;
}
