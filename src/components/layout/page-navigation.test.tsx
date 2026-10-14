import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageNavigation } from "./page-navigation";

const mocks = vi.hoisted(() => ({ pending: vi.fn(), cleanups: [] as (() => void)[] }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: boolean) => [initial, mocks.pending],
  useLayoutEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) mocks.cleanups.push(cleanup);
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/office/equipment", useSearchParams: () => new URLSearchParams() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("gsap", () => ({ gsap: {} }));

class LinkTarget {
  href = "http://localhost/office/equipment?view=maintenance&item=equipment";
  target = "";
  hasAttribute() { return false; }
  closest() { return this; }
}

beforeEach(() => {
  mocks.pending.mockClear();
  vi.stubGlobal("Element", LinkTarget);
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location: new URL("http://localhost/office/equipment") }));
});
afterEach(() => {
  mocks.cleanups.splice(0).forEach(cleanup => cleanup());
  vi.unstubAllGlobals();
});

describe("global navigation feedback", () => {
  it("clears feedback when a page's save/discard guard cancels navigation", () => {
    PageNavigation({ children: null });
    const click = new Event("click", { cancelable: true });
    Object.defineProperties(click, { target: { value: new LinkTarget() }, button: { value: 0 } });
    document.dispatchEvent(click);
    expect(mocks.pending).toHaveBeenLastCalledWith(true);

    // The link guard runs after the global capture listener, with no route change.
    click.preventDefault();
    window.dispatchEvent(new Event("studioflow:navigation-cancel"));
    expect(window.location.pathname + window.location.search).toBe("/office/equipment");
    expect(mocks.pending.mock.calls.map(([pending]) => pending)).toEqual([true, false]);

    mocks.cleanups.splice(0).forEach(cleanup => cleanup());
    mocks.pending.mockClear();
    window.dispatchEvent(new Event("studioflow:navigation-cancel"));
    expect(mocks.pending).not.toHaveBeenCalled();
  });
});
