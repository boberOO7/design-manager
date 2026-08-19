export const MOTION_STORAGE_KEY = "studioflow-motion";

export type MotionPreference = "on" | "system" | "off";

export function parseMotionPreference(value: string | null): MotionPreference {
  return value === "system" || value === "off" ? value : "on";
}

export const motionBootstrapScript = `(() => {
  try {
    const stored = localStorage.getItem("${MOTION_STORAGE_KEY}");
    const preference = stored === "system" || stored === "off" ? stored : "on";
    document.documentElement.dataset.motion = preference;
  } catch {
    document.documentElement.dataset.motion = "on";
  }
})();`;
