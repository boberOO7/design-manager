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
    const styles = ["todo", "in_progress", "internal_review", "review", "completed", "cancelled"].map(getTaskStatusBadgeStyle);
    expect(styles.map((style) => style.variant)).toEqual(["neutral", "info", "info", "violet", "success", "muted"]);
    expect(styles.map((style) => style.label)).not.toContain("in_progress");
  });

  it("uses colored headers with a stronger neutral Todo header", () => {
    expect(getTaskStatusColumnStyle("todo").headerClassName).toBe("border-[color-mix(in_srgb,var(--ui-border-strong)_70%,var(--ui-text-muted))] bg-[var(--ui-surface-subtle)] text-[var(--ui-text-secondary)]");
    expect(getTaskStatusColumnStyle("todo").countBadgeClassName).toBe("border border-[color-mix(in_srgb,var(--ui-border-strong)_70%,var(--ui-text-muted))] bg-[var(--ui-surface)] text-[var(--ui-text-secondary)]");
    expect(getTaskStatusColumnStyle("in_progress").headerClassName).toBe(getTaskStatusBadgeStyle("in_progress").className);
    expect(getTaskStatusColumnStyle("review").headerClassName).toBe(getTaskStatusBadgeStyle("review").className);
    expect(getTaskStatusColumnStyle("completed").headerClassName).toBe(getTaskStatusBadgeStyle("completed").className);
  });

  it("keeps nonzero board counts status-accented and zero counts muted", () => {
    expect(getTaskStatusCountBadgeClassName("todo", 3)).toBe(getTaskStatusColumnStyle("todo").countBadgeClassName);
    expect(getTaskStatusCountBadgeClassName("review", 3)).toBe(getTaskStatusColumnStyle("review").countBadgeClassName);
    expect(getTaskStatusCountBadgeClassName("review", 0)).toBe(`${getTaskStatusColumnStyle("review").countBadgeClassName} opacity-60`);
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
