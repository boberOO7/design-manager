"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useServerInsertedHTML } from "next/navigation";
import type { gsap } from "gsap";
import { continueInstaLoadEntries, readInstaLoadEntry, watchInstaLoadMotion } from "@/components/shared/instaload-reveal";
import { applyWorkloadCapacity, readWorkloadCapacity, workloadCapacityBootstrapScript } from "@/lib/dashboard-workload-preference";

type Position = { left: number; top: number };

/** Continue the server-painted reveal; each streamed contribution owns its own clock. */
export function DashboardMotion({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  // These survive Strict Mode rehearsals and Suspense effect reconnection.
  const seen = useRef(new Set<string>());
  const scopes = useRef(new Map<string, HTMLElement>());
  const shimmerStart = useRef<number | null>(null);
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script id="dashboard-workload-capacity" dangerouslySetInnerHTML={{ __html: workloadCapacityBootstrapScript }} />;
  });

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    applyWorkloadCapacity(readWorkloadCapacity());
    const contexts = new Map<HTMLElement, gsap.Context>();
    const snapshots = new Map<HTMLElement, Map<string, Position>>();
    let engine: typeof gsap | undefined;
    let disposed = false;
    const shimmers = new WeakSet<Animation>();

    const finishScope = (scope: HTMLElement) => {
      scope.dataset.dashboardEntrance = "ready";
      contexts.get(scope)?.revert();
      contexts.delete(scope);
    };
    const finish = () => root.querySelectorAll<HTMLElement>("[data-dashboard-ready]").forEach(finishScope);
    const motion = watchInstaLoadMotion(root, finish);

    const reveal = () => {
      if (disposed) return;
      // Newly streamed placeholders join the same compositor clock as the initial shell.
      root.querySelectorAll<HTMLElement>(".dashboard-blueprint").forEach(element => {
        element.getAnimations({ subtree: true }).forEach(animation => {
          if (!(animation instanceof CSSAnimation) || animation.animationName !== "dashboard-blueprint-shimmer" || shimmers.has(animation)) return;
          const align = () => {
            if (disposed || animation.playState === "idle" || typeof animation.startTime !== "number") return;
            shimmerStart.current ??= animation.startTime;
            animation.startTime = shimmerStart.current;
          };
          shimmers.add(animation);
          if (typeof animation.startTime === "number") align();
          else void animation.ready.then(align).catch(() => { /* A replaced placeholder may cancel before paint. */ });
        });
      });
      root.querySelectorAll<HTMLElement>("[data-dashboard-ready][data-dashboard-hydrated]").forEach(scope => {
        const name = scope.dataset.dashboardReady;
        if (!name) return;
        const previous = scopes.current.get(name);
        scopes.current.set(name, scope);
        const arrivals = Array.from(scope.querySelectorAll<HTMLElement>("[data-dashboard-arrival]"));
        if (motion.disabled() || (previous && previous !== scope)) {
          if (previous && previous !== scope) finishScope(previous);
          finishScope(scope);
          arrivals.forEach(element => { if (element.dataset.dashboardArrival) seen.current.add(element.dataset.dashboardArrival); });
          return;
        }
        if (!engine) return; // The short CSS reveal finishes naturally while the chunk loads.
        const gsap = engine;
        const before = snapshots.get(scope);
        snapshots.delete(scope);
        // Read everything before changing styles; FLIP stays inside the list viewport.
        const moves = before ? arrivals.flatMap(element => {
          const key = element.dataset.dashboardArrival;
          const old = key ? before.get(key) : undefined;
          const box = element.getBoundingClientRect();
          return old && box.height && (old.left !== box.left || old.top !== box.top)
            ? [{ element, x: old.left - box.left, y: old.top - box.top }] : [];
        }) : [];
        const entries = arrivals.flatMap(element => {
          const key = element.dataset.dashboardArrival;
          if (!key || seen.current.has(key)) return [];
          seen.current.add(key);
          const target = element.querySelector<HTMLElement>("[data-dashboard-value]") ?? element;
          const entry = readInstaLoadEntry(element, target);
          return entry ? [entry] : [];
        });
        // Removing the CSS owner and taking over happen in the same pre-paint turn.
        scope.dataset.dashboardEntrance = "ready";
        if (!entries.length && !moves.length) return;
        const context = contexts.get(scope) ?? gsap.context(() => {}, scope);
        contexts.set(scope, context);
        context.add(() => {
          const sequence = gsap.timeline({ defaults: { overwrite: "auto" } });
          moves.forEach(move => sequence.fromTo(move.element, { x: move.x, y: move.y }, {
            x: 0, y: 0, duration: 0.18, ease: "power2.out", clearProps: "transform",
          }, 0));
          // Finish the row relocation before revealing its new neighbour.
          const start = moves.length ? sequence.duration() : 0;
          continueInstaLoadEntries(sequence, entries, start);
        });
      });
    };
    const beforeUpdate = (event: Event) => {
      const scope = event.target;
      if (!(scope instanceof HTMLElement) || !scope.hasAttribute("data-dashboard-hydrated")) return;
      finishScope(scope);
      const positions = new Map<string, Position>();
      scope.querySelectorAll<HTMLElement>("[data-dashboard-arrival]").forEach(element => {
        const key = element.dataset.dashboardArrival;
        const box = element.getBoundingClientRect();
        if (key) positions.set(key, { left: box.left, top: box.top });
      });
      snapshots.set(scope, positions);
      scope.dataset.dashboardEntrance = "finance";
    };
    const content = new MutationObserver(reveal);
    content.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-dashboard-hydrated"] });
    root.addEventListener("dashboard-before-stream-update", beforeUpdate);
    root.addEventListener("dashboard-ready", reveal);
    reveal();
    if (!motion.disabled()) void import("gsap").then(({ gsap }) => {
      if (disposed) return;
      engine = gsap;
      reveal();
    }).catch(() => { if (!disposed) finish(); });
    return () => {
      disposed = true;
      content.disconnect();
      motion.dispose();
      root.removeEventListener("dashboard-before-stream-update", beforeUpdate);
      root.removeEventListener("dashboard-ready", reveal);
      // Leave CSS-only fallback reveals alone during a Strict Mode rehearsal.
      contexts.forEach((context, scope) => { context.revert(); scope.dataset.dashboardEntrance = "ready"; });
      contexts.clear();
      snapshots.clear();
    };
  }, []);
  return <div ref={container} className="min-w-0">{children}</div>;
}

export function DashboardReady({ children, name, className }: { children: ReactNode; name: string; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    root.setAttribute("data-dashboard-hydrated", "");
    root.dispatchEvent(new Event("dashboard-ready", { bubbles: true }));
  }, []);
  return <div ref={container} data-dashboard-ready={name} data-dashboard-entrance="pending" className={className}>{children}</div>;
}
