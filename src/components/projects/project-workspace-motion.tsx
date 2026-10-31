"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./work-directions.module.css";

// Reserve scroll space during navigation without clipping or hiding ready content.
export function ProjectWorkspaceMotion({ children, motionKey }: { children: ReactNode; motionKey: string }) {
  const surface = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const previousKey = useRef(motionKey), height = useRef<number | null>(null);
  const resize = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const outer = surface.current, inner = content.current;
    if (!outer || !inner) return;
    let waitingForContent = false;
    const measure = () => {
      const loading = Array.from(inner.querySelectorAll<HTMLElement>("[data-project-loading]")).some(element => element.getClientRects().length > 0);
      waitingForContent = loading;
      if (loading) {
        outer.style.minHeight = `${height.current ?? inner.getBoundingClientRect().height}px`;
      } else {
        outer.style.removeProperty("min-height");
        height.current = inner.getBoundingClientRect().height;
      }
    };
    height.current = inner.getBoundingClientRect().height;
    resize.current = measure;
    const observer = new ResizeObserver(() => {
      if (waitingForContent) measure();
      else height.current = inner.getBoundingClientRect().height;
    });
    observer.observe(inner);
    // A fallback can be replaced by content of the same height.
    const arrivals = new MutationObserver(() => { if (waitingForContent) measure(); });
    arrivals.observe(inner, { childList: true, subtree: true });
    return () => {
      resize.current = null;
      observer.disconnect(); arrivals.disconnect();
      outer.style.removeProperty("min-height");
    };
  }, []);

  useLayoutEffect(() => {
    if (previousKey.current === motionKey) return;
    previousKey.current = motionKey;
    resize.current?.();
  }, [motionKey]);

  return <div ref={surface} className={styles.resizingSurface} data-workspace-motion><div ref={content} className={styles.measuredSurface}>{children}</div></div>;
}
