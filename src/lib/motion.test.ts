import { describe, expect, it } from "vitest";
import {
  MOTION_STORAGE_KEY,
  motionBootstrapScript,
  parseMotionPreference,
} from "./motion";

describe("motion preference", () => {
  it("defaults to animations on unless the user explicitly chooses system or off", () => {
    expect(parseMotionPreference(null)).toBe("on");
    expect(parseMotionPreference("unexpected")).toBe("on");
    expect(parseMotionPreference("system")).toBe("system");
    expect(parseMotionPreference("off")).toBe("off");
  });

  it("sets the persisted preference on the document before hydration", () => {
    expect(motionBootstrapScript).toContain(`localStorage.getItem("${MOTION_STORAGE_KEY}")`);
    expect(motionBootstrapScript).toContain('document.documentElement.dataset.motion = preference');
    expect(motionBootstrapScript).toContain('document.documentElement.dataset.motion = "on"');
  });
});
