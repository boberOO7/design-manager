import type { gsap } from "gsap";
import { parseMotionPreference } from "@/lib/motion";

const entryAnimations = new Set(["dashboard-row-enter", "dashboard-value-enter"]);

/** Read the server-painted aperture so hydration never starts a second reveal. */
export function readInstaLoadEntry(element: HTMLElement, target = element) {
  const animation = target.getAnimations().find((animation): animation is CSSAnimation => animation instanceof CSSAnimation && entryAnimations.has(animation.animationName));
  const elapsed = typeof animation?.currentTime === "number" ? animation.currentTime : 0;
  const duration = animation?.effect?.getTiming().duration;
  const remaining = typeof duration === "number" ? Math.max(0, (duration - elapsed) / 1000) : 0;
  const box = target.getBoundingClientRect();
  if (!remaining || !box.height || box.bottom <= 0 || box.top >= window.innerHeight) return null;
  const style = getComputedStyle(target);
  return { element, target, clip: style.clipPath, y: new DOMMatrixReadOnly(style.transform).m42, remaining };
}

export function continueInstaLoadEntries(sequence: gsap.core.Timeline, entries: NonNullable<ReturnType<typeof readInstaLoadEntry>>[], start = 0) {
  entries.forEach(({ element, target, clip, y, remaining }, index) => {
    const at = start + Math.min(0.1, index * 0.025);
    sequence.fromTo(target, { clipPath: clip, y }, {
      clipPath: "inset(0% 0% 0% 0%)", y: 0, duration: remaining,
      ease: target === element ? "power3.out" : "back.out(1.05)", clearProps: "clipPath,transform",
    }, at);
    const icons = element.querySelectorAll<HTMLElement>("[data-dashboard-icon], [data-instaload-icon]");
    if (icons.length) sequence.fromTo(icons, { scale: 0.82, rotation: -10 }, {
      scale: 1, rotation: 0, duration: Math.min(0.46, remaining + 0.08),
      ease: "elastic.out(0.6,0.5)", clearProps: "transform",
    }, at);
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
