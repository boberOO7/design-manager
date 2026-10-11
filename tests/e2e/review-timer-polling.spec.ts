import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import { reviewTimerInputSchema, reviewTimerSnapshotSchema, type ReviewTimerSession, type ReviewTimerSnapshot } from "../../src/lib/review-timer";

declare global {
  interface Window {
    reviewTimerTestIntervals: Map<number, number>;
  }
}

const fixtureRequire = createRequire(`${process.cwd()}/package.json`);
const esbuild = fixtureRequire.resolve("esbuild/bin/esbuild", { paths: [fixtureRequire.resolve("tsx")] });
// Exercise the real provider in StrictMode without database fixtures or a Next build.
const script = execFileSync(esbuild, ["--bundle", "--loader=tsx", "--jsx=automatic", "--platform=browser", "--format=iife",
  "--external:next/navigation", '--define:process.env.NODE_ENV="development"'], {
  encoding: "utf8", maxBuffer: 4_000_000, input: `
    import { StrictMode } from "react";
    import { createRoot } from "react-dom/client";
    import { ReviewTimerProvider, useReviewTimer } from "./src/hooks/use-review-timer";
    import { currentReviewTimerSession, formatReviewElapsed, reviewGroupElapsed } from "./src/lib/review-timer";
    function Controls() {
      const timer = useReviewTimer();
      const current = currentReviewTimerSession(timer.snapshot);
      return <>
        <output data-state>{current?.state ?? "idle"}</output>
        <output data-time>{current ? formatReviewElapsed(reviewGroupElapsed(timer.snapshot, current, timer.serverNow)) : "00:00:00"}</output>
        <button disabled={timer.pending} onClick={() => timer.control({ action: "start", roundIds: ["00000000-0000-4000-8000-000000000002"] })}>Start</button>
        <button disabled={timer.pending || current?.state !== "active"} onClick={() => timer.control({ action: "pause", sessionId: current.id })}>Pause</button>
        <button disabled={timer.pending || current?.state !== "paused"} onClick={() => timer.control({ action: "start", roundIds: current.members.map(member => member.round_id) })}>Resume</button>
      </>;
    }
    const initial = JSON.parse(document.getElementById("snapshot").textContent);
    const root = createRoot(document.getElementById("root"));
    root.render(<StrictMode><ReviewTimerProvider initialSnapshot={initial}><Controls /></ReviewTimerProvider></StrictMode>);
    document.getElementById("unmount").onclick = () => root.unmount();
  `,
});

test("adaptive polling switches one interval, preserves event recovery, and cleans up across tabs", async ({ page, context }) => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const roundId = "00000000-0000-4000-8000-000000000002";
  const epoch = new Date("2026-10-12T09:00:00Z");
  let serverTime = epoch.getTime();
  let sessions: ReviewTimerSession[] = [];
  const gets = new Map<Page, number>();
  const pendingGets = new Map<Page, number>();
  let maxPendingGets = 0;
  let heldGet: Promise<void> | null = null;
  const snapshot = (at: string): ReviewTimerSnapshot => ({ serverNow: at, userId, sessions });
  function account(at: string) {
    sessions = sessions.map(session => session.state !== "active" || !session.accounted_at ? session : {
      ...session, elapsed_us: session.elapsed_us + (Date.parse(at) - Date.parse(session.accounted_at)) * 1000, accounted_at: at,
    });
  }
  await context.addInitScript(() => {
    Object.assign(window, { require: (name: string) => {
      if (name !== "next/navigation") throw new Error(`Unexpected external module: ${name}`);
      const router = { refresh: () => {} };
      return { useRouter: () => router };
    } });
  });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    const source = route.request().frame().page();
    if (url.pathname === "/api/review-timers") serverTime = Math.max(serverTime, await source.evaluate(() => Date.now()));
    const at = new Date(serverTime).toISOString();
    if (url.pathname === "/timer-polling-fixture") {
      await route.fulfill({ contentType: "text/html", body: `<div id="root"></div><button id="unmount">Unmount</button><script id="snapshot" type="application/json">${JSON.stringify(snapshot(at))}</script><script src="/timer-polling-fixture.js"></script>` });
    } else if (url.pathname === "/timer-polling-fixture.js") {
      await route.fulfill({ contentType: "text/javascript", body: script });
    } else if (url.pathname === "/api/review-timers") {
      account(at);
      if (route.request().method() === "POST") {
        const body = reviewTimerInputSchema.parse(route.request().postDataJSON());
        if (body.action === "pause") sessions = sessions.map(session => ({ ...session, state: "paused", accounted_at: null }));
        else {
          sessions.push({ id: body.sessionId, user_id: userId, state: "active", started_at: at, accounted_at: at, elapsed_us: 0,
            members: [{ round_id: roundId, finished_at: null }] });
        }
        await route.fulfill({ json: reviewTimerSnapshotSchema.parse(snapshot(at)) });
      } else {
        gets.set(source, (gets.get(source) ?? 0) + 1);
        const pending = (pendingGets.get(source) ?? 0) + 1;
        pendingGets.set(source, pending);
        maxPendingGets = Math.max(maxPendingGets, pending);
        if (heldGet) await heldGet;
        await route.fulfill({ json: snapshot(at) });
        pendingGets.set(source, pending - 1);
      }
    } else await route.fulfill({ status: 404 });
  });
  async function open(target: Page) {
    const time = new Date(serverTime);
    await target.clock.install({ time });
    await target.clock.pauseAt(time);
    await target.addInitScript(() => {
      const set = window.setInterval;
      const clear = window.clearInterval;
      window.reviewTimerTestIntervals = new Map();
      Reflect.set(window, "setInterval", (handler: TimerHandler, milliseconds?: number) => {
        const id = set(handler, milliseconds);
        window.reviewTimerTestIntervals.set(id, milliseconds ?? 0);
        return id;
      });
      Reflect.set(window, "clearInterval", (id?: number) => {
        if (id !== undefined) window.reviewTimerTestIntervals.delete(id);
        clear(id);
      });
    });
    await target.goto("/timer-polling-fixture");
    await expect(target.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  }
  async function intervals(target: Page, poll: number) {
    await expect.poll(() => target.evaluate(() => [...window.reviewTimerTestIntervals.values()].sort((a, b) => a - b))).toEqual([1000, poll]);
  }
  async function advance(target: Page, milliseconds: number, expected: number) {
    const before = gets.get(target) ?? 0;
    const response = expected ? target.waitForResponse(response => new URL(response.url()).pathname === "/api/review-timers" && response.request().method() === "GET") : null;
    await target.clock.runFor(milliseconds);
    if (response) await response;
    await target.evaluate(() => {});
    expect((gets.get(target) ?? 0) - before).toBe(expected);
  }
  await open(page);
  await intervals(page, 120_000);
  await advance(page, 119_000, 0);
  await advance(page, 1000, 1);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator("[data-state]")).toHaveText("active");
  await intervals(page, 15_000);
  await advance(page, 14_000, 0);
  await expect(page.locator("[data-time]")).toHaveText("00:00:14");
  await advance(page, 1000, 1);
  await advance(page, 15_000, 1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator("[data-state]")).toHaveText("paused");
  await intervals(page, 60_000);
  const frozen = await page.locator("[data-time]").textContent();
  await advance(page, 59_000, 0);
  await expect(page.locator("[data-time]")).toHaveText(frozen ?? "");
  await advance(page, 1000, 1);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator("[data-state]")).toHaveText("active");
  await intervals(page, 15_000);
  await advance(page, 15_000, 1);
  const beforeRecovery = gets.get(page) ?? 0;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => gets.get(page)).toBe(beforeRecovery + 1);
  let releaseGet = () => {};
  heldGet = new Promise<void>(resolve => { releaseGet = resolve; });
  const beforeHeldGet = gets.get(page) ?? 0;
  const recovered = page.waitForResponse(response => new URL(response.url()).pathname === "/api/review-timers" && response.request().method() === "GET");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => gets.get(page)).toBe(beforeHeldGet + 1);
  await page.clock.runFor(15_000);
  expect(gets.get(page)).toBe(beforeHeldGet + 1);
  heldGet = null; releaseGet();
  await recovered;

  const other = await context.newPage();
  try {
    await open(other);
    await expect(other.locator("[data-state]")).toHaveText("active");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(other.locator("[data-state]")).toHaveText("paused");
    await intervals(other, 60_000);
    await other.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(page.locator("[data-state]")).toHaveText("active");
    await intervals(page, 15_000);
    const latest = sessions.at(-1);
    if (!latest) throw new Error("Expected resumed session");
    sessions = [{ ...latest, user_id: "00000000-0000-4000-8000-000000000003", state: "active" }];
    await page.evaluate(() => window.dispatchEvent(new Event("review-timer-change")));
    await expect(page.locator("[data-state]")).toHaveText("idle");
    await intervals(page, 15_000);
    await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
    await advance(page, 15_000, 1);
    sessions = [];
    await page.evaluate(() => window.dispatchEvent(new Event("review-timer-change")));
    await intervals(page, 120_000);
    await intervals(other, 120_000);
    await page.getByRole("button", { name: "Unmount", exact: true }).click();
    await other.getByRole("button", { name: "Unmount", exact: true }).click();
    expect(await page.evaluate(() => window.reviewTimerTestIntervals.size)).toBe(0);
    expect(await other.evaluate(() => window.reviewTimerTestIntervals.size)).toBe(0);
    await advance(page, 180_000, 0);
    await advance(other, 180_000, 0);
    const afterUnmount = gets.get(page);
    await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("review-timer-change")); });
    expect(gets.get(page)).toBe(afterUnmount);
    expect(maxPendingGets).toBe(1);
    console.log("POLLING_NETWORK_OK", JSON.stringify({ idle: "1 GET / 120s", active: "2 GETs / 30s", paused: "1 GET / 60s", recovery: "1 coalesced GET", crossTab: true, admin: true, background: true, cleanup: true }));
  } finally { await other.close(); }
});
