import type { gsap } from "gsap";
import { parseMotionPreference } from "@/lib/motion";

const entryAnimations = new Set(["dashboard-row-enter", "dashboard-value-enter"]);

/** Continue the server-painted whole-block motion without hiding its content. */
export function readInstaLoadEntry(element: HTMLElement, target = element) {
  const animation = target.getAnimations().find((animation): animation is CSSAnimation => animation instanceof CSSAnimation && entryAnimations.has(animation.animationName));
  const elapsed = typeof animation?.currentTime === "number" ? animation.currentTime : 0;
  const duration = animation?.effect?.getTiming().duration;
  const remaining = typeof duration === "number" ? Math.max(0, (duration - elapsed) / 1000) : 0;
  const box = target.getBoundingClientRect();
  if (!remaining || !box.height || box.bottom <= 0 || box.top >= window.innerHeight) return null;
  const style = getComputedStyle(target);
  return { element, target, y: new DOMMatrixReadOnly(style.transform).m42, remaining };
}

export function continueInstaLoadEntries(sequence: gsap.core.Timeline, entries: NonNullable<ReturnType<typeof readInstaLoadEntry>>[], start = 0) {
  entries.forEach(({ target, y, remaining }) => {
    sequence.fromTo(target, { y }, {
      y: 0, duration: remaining, ease: "power2.out", clearProps: "transform",
    }, start);
  });
}

/** The same interruption and accessibility policy for every streamed scope. */
export function watchInstaLoadMotion(root: HTMLElement, finish: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const disabled = () => reduced.matches || parseMotionPreference(document.documentElement.dataset.motion ?? null) === "off";
  const changed = () => { if (disabled()) finish(); };
  const preferences = new MutationObserver(changed);
  preferences.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  reduced.addEventListener("change", changed);
  root.addEventListener("focusin", finish);
  root.addEventListener("pointerdown", finish);
  return { disabled, dispose() {
    preferences.disconnect();
    reduced.removeEventListener("change", changed);
    root.removeEventListener("focusin", finish);
    root.removeEventListener("pointerdown", finish);
  } };
}
