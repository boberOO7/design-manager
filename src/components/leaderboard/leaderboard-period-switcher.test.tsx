import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardMonthRange, LeaderboardPeriodMode } from "@/lib/productivity";

const navigation = vi.hoisted(() => ({ query: "", replace: vi.fn(), changeMode: (_mode: LeaderboardPeriodMode) => {}, commit: (_range: LeaderboardMonthRange) => {} }));

vi.mock("@radix-ui/react-popover", () => {
  const container = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { Root: container, Trigger: container, Portal: container, Content: container };
});
vi.mock("@/components/leaderboard/leaderboard-month-timeline", () => ({
  LeaderboardMonthTimeline: ({ onCommit }: { onCommit: (range: LeaderboardMonthRange) => void }) => {
    navigation.commit = onCommit;
    return null;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => "/leaderboard",
  useSearchParams: () => new URLSearchParams(navigation.query),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/segmented-control", () => ({
  SegmentedControl: ({ onValueChange }: { onValueChange: (mode: LeaderboardPeriodMode) => void }) => {
    navigation.changeMode = onValueChange;
    return null;
  },
}));

import { LeaderboardPeriodSwitcher } from "./leaderboard-period-switcher";

const quarter = { from: "2026-04", through: "2026-06" };

beforeEach(() => {
  navigation.query = "";
  navigation.replace.mockReset();
});

describe("Productivity period URL state", () => {
  it.each([
    ["month", "/leaderboard"],
    ["quarter", "/leaderboard?period=quarter"],
    ["year", "/leaderboard?period=year"],
  ] as const)("keeps the %s mode URL behavior", (mode, expectedUrl) => {
    navigation.query = mode === "month" ? "period=quarter" : "";
    renderToStaticMarkup(<LeaderboardPeriodSwitcher period={mode === "month" ? "quarter" : "month"} initialRange={quarter} locale="en" />);
    navigation.changeMode(mode);
    expect(navigation.replace).toHaveBeenCalledWith(expectedUrl, { scroll: false });
  });

  it("enters custom mode using the current period context and preserves other parameters", () => {
    navigation.query = "period=quarter&context=team";
    renderToStaticMarkup(<LeaderboardPeriodSwitcher period="quarter" initialRange={quarter} locale="en" />);
    navigation.changeMode("custom");
    expect(navigation.replace).toHaveBeenCalledWith("/leaderboard?period=custom&context=team&from=2026-04&through=2026-06", { scroll: false });
  });

  it("remembers a cross-year range when leaving and reentering custom mode", () => {
    const range = { from: "2025-11", through: "2026-02" };
    navigation.query = "period=custom&from=2025-11&through=2026-02";
    renderToStaticMarkup(<LeaderboardPeriodSwitcher period={range} initialRange={range} locale="en" />);
    navigation.changeMode("month");
    expect(navigation.replace).toHaveBeenLastCalledWith("/leaderboard?from=2025-11&through=2026-02", { scroll: false });

    navigation.query = "from=2025-11&through=2026-02";
    renderToStaticMarkup(<LeaderboardPeriodSwitcher period="month" initialRange={quarter} locale="en" />);
    navigation.changeMode("custom");
    expect(navigation.replace).toHaveBeenLastCalledWith("/leaderboard?from=2025-11&through=2026-02&period=custom", { scroll: false });
  });

  it("writes a committed timeline range directly to the URL and skips unchanged selections", () => {
    navigation.query = "period=custom&from=2026-04&through=2026-06&context=team";
    renderToStaticMarkup(<LeaderboardPeriodSwitcher period={quarter} initialRange={quarter} locale="en" />);
    navigation.commit(quarter);
    expect(navigation.replace).not.toHaveBeenCalled();

    navigation.commit({ from: "2025-11", through: "2026-02" });
    expect(navigation.replace).toHaveBeenCalledOnce();
    expect(navigation.replace).toHaveBeenCalledWith("/leaderboard?period=custom&from=2025-11&through=2026-02&context=team", { scroll: false });
  });
});
