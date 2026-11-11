import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarDataStreams } from "@/types/calendar";
import CalendarPage from "./page";

const mocks = vi.hoisted(() => ({ getCalendarStreams: vi.fn() }));
vi.mock("@/data/queries/calendar", () => ({ getCalendarStreams: mocks.getCalendarStreams }));
vi.mock("@/components/calendar/calendar-workspace", () => ({ CalendarStream: () => null }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

const streams: CalendarDataStreams = {
  data: new Promise(() => {}), projects: new Promise(() => {}), people: new Promise(() => {}),
  preferences: Promise.resolve({ timeFormat: "24h", timeZone: "Europe/Kyiv" }),
};

beforeEach(() => { mocks.getCalendarStreams.mockReset().mockResolvedValue(streams); });

describe("Calendar page shared snapshot", () => {
  it.each(["month", "week", "agenda"])("loads the same complete range for %s and streams unresolved data", async (view) => {
    const page = await CalendarPage({ searchParams: Promise.resolve({ view, date: "2026-11-30" }) });
    expect(mocks.getCalendarStreams).toHaveBeenCalledExactlyOnceWith({ start: "2026-10-26", end: "2026-12-29" });
    expect(page.props).toMatchObject({ initialView: view, initialDate: "2026-11-30", streams: { data: streams.data, projects: streams.projects, people: streams.people } });
    expect(page.key).toBe("2026-11-30:");
  });

  it("defaults invalid views to Week and retains explicit refresh invalidation", async () => {
    const page = await CalendarPage({ searchParams: Promise.resolve({ view: "invalid", date: "2026-11-30", refresh: "updated-event" }) });
    expect(page.props.initialView).toBe("week");
    expect(page.key).toBe("2026-11-30:updated-event");
  });

  it("does not render data without an active studio", async () => {
    mocks.getCalendarStreams.mockResolvedValue(null);
    await expect(CalendarPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Calendar data is unavailable");
  });
});
