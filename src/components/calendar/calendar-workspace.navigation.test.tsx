import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";
import type { CalendarCoreData, CalendarDataStreams } from "@/types/calendar";
import { CalendarBlueprint, CalendarWorkspace } from "./calendar-workspace";

const mocks = vi.hoisted(() => ({
  href: "http://localhost/calendar?view=week&date=2026-11-30&person=user&tasks=1",
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  selectView: vi.fn<(view: string) => void>(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URL(mocks.href).searchParams,
}));
vi.mock("@/components/ui/segmented-control", () => ({
  SegmentedControl: ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) => {
    mocks.selectView.mockImplementation(onValueChange);
    return <span data-selected-view={value} />;
  },
}));

const data: CalendarCoreData = {
  items: ["2026-11-30", "2026-12-20"].map((date) => ({
    source: "studio_day_off", id: date, key: date, title: `Day off ${date}`, allDay: true,
    startDate: date, endDate: date, projectId: null, personIds: ["user"], note: null,
  })),
  currentUserId: "user", isAdmin: true, vacationVisibleToEmployees: true, pendingCount: 0,
  rangeStart: "2026-10-26", rangeEnd: "2026-12-29", today: "2026-11-30",
  compensableDayOffs: [], timeFormat: "24h", timeZone: "Europe/Kyiv",
};
const streams: Pick<CalendarDataStreams, "projects" | "people"> = { projects: new Promise(() => {}), people: new Promise(() => {}) };
const pushState = vi.fn((_state: unknown, _unused: string, href: string) => { mocks.href = new URL(href, mocks.href).href; });
function render(loading = false) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="en" timeZone="Europe/Kyiv" messages={messages}>
    {loading
      ? <CalendarBlueprint initialView="week" initialDate="2026-11-30" timeFormat="24h" timeZone="Europe/Kyiv" />
      : <CalendarWorkspace initialData={data} initialView="week" initialDate="2026-11-30" {...streams} />}
  </NextIntlClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.href = "http://localhost/calendar?view=week&date=2026-11-30&person=user&tasks=1";
  vi.stubGlobal("window", {
    get location() { return new URL(mocks.href); },
    history: { pushState },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Calendar local view navigation", () => {
  it("switches all tabs from one snapshot without router requests and preserves URL filters", () => {
    expect(render()).toContain('class="calendar-week-view relative"');
    mocks.selectView("month");
    const monthHref = mocks.href;
    expect(render()).toContain('class="calendar-month-view"');
    mocks.selectView("agenda");
    const agenda = render();
    expect(agenda).toContain('data-selected-view="agenda"');
    expect(agenda).toContain("Day off 2026-12-20");
    expect(new URL(mocks.href).searchParams.get("person")).toBe("user");
    expect(new URL(mocks.href).searchParams.get("tasks")).toBe("1");
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();

    // Back/Forward restores URL state while the original server props stay Week.
    mocks.href = monthHref;
    expect(render()).toContain('data-selected-view="month"');
  });

  it.each([false, true])("keeps reselecting the current view inert (loading=%s)", (loading) => {
    render(loading);
    const href = mocks.href;
    mocks.selectView("week");
    expect(mocks.href).toBe(href);
    expect(pushState).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("also switches the empty calendar immediately while the first data stream is pending", () => {
    expect(render(true)).toContain('class="calendar-week-view relative"');
    mocks.selectView("month");
    const month = render(true);
    expect(month).toContain('class="calendar-month-view"');
    expect(month).not.toContain("instaload-mark");
    expect(pushState).toHaveBeenCalledOnce();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });
});
