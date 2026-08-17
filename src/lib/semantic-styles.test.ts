import { describe, expect, it } from "vitest";
import {
  getPriorityBadgeStyle,
  getProjectHealthBadgeStyle,
  getProjectLifecycleBadgeStyle,
  getTaskStatusBadgeStyle,
  getTaskStatusColumnStyle,
  getTaskStatusCountBadgeClassName,
  getTimeOffStatusBadgeStyle,
} from "./semantic-styles";

describe("semantic badge styles", () => {
  it("maps priorities from neutral low through blue normal, amber high, and warm urgent", () => {
    expect(["low", "normal", "high", "urgent"].map((value) => getPriorityBadgeStyle(value).variant)).toEqual(["neutral", "info", "warning", "urgent"]);
  });

  it("maps every task status and keeps user-facing labels", () => {
    const styles = ["todo", "in_progress", "review", "completed", "cancelled"].map(getTaskStatusBadgeStyle);
    expect(styles.map((style) => style.variant)).toEqual(["neutral", "info", "violet", "success", "muted"]);
    expect(styles.map((style) => style.label)).not.toContain("in_progress");
  });

  it("derives board-column tints from the same task-status semantic tokens", () => {
    expect(getTaskStatusColumnStyle("todo").headerClassName).toBe(getTaskStatusBadgeStyle("todo").className);
    expect(getTaskStatusColumnStyle("in_progress").bodyClassName).toContain("--ui-info-surface");
    expect(getTaskStatusColumnStyle("review").bodyClassName).toContain("--ui-violet-surface");
    expect(getTaskStatusColumnStyle("completed").bodyClassName).toContain("--ui-success-surface");
  });

  it("keeps nonzero board counts status-accented and zero counts muted", () => {
    expect(getTaskStatusCountBadgeClassName("review", 3)).toBe(getTaskStatusBadgeStyle("review").className);
    expect(getTaskStatusCountBadgeClassName("review", 0)).toBe(`${getTaskStatusBadgeStyle("review").className} opacity-60`);
  });

  it("maps project lifecycle and health independently", () => {
    expect(["planned", "active", "paused", "completed", "archived"].map((value) => getProjectLifecycleBadgeStyle(value).variant)).toEqual(["neutral", "success", "warning", "violet", "muted"]);
    expect(getProjectHealthBadgeStyle("on_track").variant).toBe("success");
    expect(getProjectHealthBadgeStyle("completed").variant).toBe("info");
    expect(getProjectHealthBadgeStyle("overdue").variant).toBe("danger");
  });

  it("maps every time-off status", () => {
    expect(["pending", "approved", "rejected", "cancelled"].map((value) => getTimeOffStatusBadgeStyle(value).variant)).toEqual(["warning", "success", "danger", "muted"]);
  });

  it("falls back to neutral for unknown values", () => {
    expect(getPriorityBadgeStyle("unexpected").variant).toBe("neutral");
    expect(getTaskStatusBadgeStyle("unexpected").variant).toBe("neutral");
    expect(getProjectLifecycleBadgeStyle("unexpected").variant).toBe("neutral");
    expect(getProjectHealthBadgeStyle("unexpected").variant).toBe("neutral");
    expect(getTimeOffStatusBadgeStyle("unexpected").variant).toBe("neutral");
  });
});
