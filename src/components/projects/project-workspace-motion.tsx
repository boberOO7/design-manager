"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./work-directions.module.css";

// Animate layout only for navigation. Ordinary board edits/accordions retain
// their own transitions, and the mounted board is never cloned or remounted.
export function ProjectWorkspaceMotion({ children, motionKey }: { children: ReactNode; motionKey: string }) {
  const surface = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const previousKey = useRef(motionKey), height = useRef<number | null>(null);
  const animation = useRef<Animation | null>(null);
  const resize = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const outer = surface.current, inner = content.current;
    if (!outer || !inner) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let keyboard = false;
    const disabled = () => keyboard || reduced.matches || document.documentElement.dataset.motion === "off";
    const finish = () => {
      animation.current?.cancel();
      animation.current = null;
      outer.style.removeProperty("height");
      delete outer.dataset.resizing;
      height.current = inner.getBoundingClientRect().height;
    };
    const measure = () => {
      const next = inner.getBoundingClientRect().height;
      const from = animation.current ? outer.getBoundingClientRect().height : height.current ?? next;
      animation.current?.cancel();
      height.current = next;
      if (disabled() || Math.abs(next - from) < 1) { finish(); return; }
      outer.style.height = `${next}px`;
      outer.dataset.resizing = "true";
      const tween = outer.animate([{ height: `${from}px` }, { height: `${next}px` }], {
        duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
      animation.current = tween;
      tween.onfinish = finish;
    };
    height.current = inner.getBoundingClientRect().height;
    resize.current = measure;
    const observer = new ResizeObserver(() => {
      const next = inner.getBoundingClientRect().height;
      if (next === height.current) return;
      // Streaming or responsive content may change the destination mid-transition.
      if (animation.current) measure(); else height.current = next;
    });
    observer.observe(inner);
    const onKeyboard = () => { keyboard = true; finish(); };
    const onPointer = () => { keyboard = false; };
    const onPreference = () => { if (disabled()) finish(); };
    const preferences = new MutationObserver(onPreference);
    preferences.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    reduced.addEventListener("change", onPreference);
    document.addEventListener("keydown", onKeyboard, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      resize.current = null;
      observer.disconnect(); preferences.disconnect();
      reduced.removeEventListener("change", onPreference);
      document.removeEventListener("keydown", onKeyboard, true);
      document.removeEventListener("pointerdown", onPointer, true);
      finish();
    };
  }, []);

  useLayoutEffect(() => {
    if (previousKey.current === motionKey) return;
    previousKey.current = motionKey;
    resize.current?.();
  }, [motionKey]);

  return <div ref={surface} className={styles.resizingSurface} data-workspace-motion><div ref={content} className={styles.measuredSurface}>{children}</div></div>;
}
