"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { gsap } from "gsap";
import { continueInstaLoadEntries, readInstaLoadEntry, watchInstaLoadMotion } from "./instaload-reveal";

/** Each Suspense contribution continues its own server-painted reveal once. */
export function InstaLoadReady({ children, name, className = "" }: { children: ReactNode; name: string; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const seen = useRef(new WeakSet<HTMLElement>());
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    let context: gsap.Context | undefined;
    let disposed = false;
    const finish = () => { root.dataset.instaloadEntrance = "ready"; context?.revert(); context = undefined; };
    const motion = watchInstaLoadMotion(root, finish);
    if (motion.disabled()) finish();
    else void import("gsap").then(({ gsap }) => {
      if (disposed || motion.disabled()) return;
      const entries = Array.from(root.querySelectorAll<HTMLElement>("[data-instaload-arrival]")).flatMap(element => {
        if (seen.current.has(element)) return [];
        seen.current.add(element);
        const entry = readInstaLoadEntry(element, element.querySelector<HTMLElement>("[data-instaload-value]") ?? element);
        return entry ? [entry] : [];
      });
      root.dataset.instaloadEntrance = "ready";
      if (!entries.length) return;
      context = gsap.context(() => {
        continueInstaLoadEntries(gsap.timeline({ defaults: { overwrite: "auto" } }), entries);
      }, root);
    }).catch(() => { if (!disposed) finish(); });
    return () => { disposed = true; motion.dispose(); if (context) finish(); };
  }, []);
  return <div ref={container} data-instaload-ready={name} data-instaload-entrance="pending" className={`min-w-0 ${className}`}>{children}</div>;
}
