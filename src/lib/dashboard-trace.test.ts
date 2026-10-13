import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
import { createDashboardTrace, traceDashboardStage } from "./dashboard-trace";
import { isDashboardTraceRequest } from "./dashboard-trace-request";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("reports overlapping branch offsets and the last ready branch, without payloads or errors", async () => {
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const trace = createDashboardTrace("test-request", 990);
  let completeTasks: (value: string) => void = () => {};
  const tasks = trace.measure("tasks", () => new Promise<string>(resolve => { completeTasks = resolve; }));
  clock = 2;
  await trace.measure("operations", () => "private financial payload");
  clock = 20;
  completeTasks("private profile payload");
  expect(await tasks).toBe("private profile payload");
  const failure = new Error("private token and SQL parameters");
  clock = 21;
  await expect(trace.measure("administration", () => { throw failure; })).rejects.toBe(failure);
  trace.flush();
  expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
    event: "studioflow.dashboard.trace", version: 1, request_id: "test-request",
    scope: "proxy_to_dashboard_loader", loader_complete_ms: null,
    critical_branch: "administration", parallel_window_ms: 21,
    spans: [
      { stage: "tasks", start_ms: 10, duration_ms: 20, completion_ms: 30, outcome: "resolved" },
      { stage: "operations", start_ms: 12, duration_ms: 0, completion_ms: 12, outcome: "resolved" },
      { stage: "administration", start_ms: 31, duration_ms: 0, completion_ms: 31, outcome: "rejected" },
    ],
  }));
});

it("does not inspect headers or log when disabled, and invokes existing work immediately", async () => {
  vi.stubEnv("STUDIOFLOW_DASHBOARD_TRACE", "0");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const work = vi.fn(() => 42);
  const result = traceDashboardStage("tasks", work);
  expect(work).toHaveBeenCalledOnce();
  expect(await result).toBe(42);
  expect(mocks.headers).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it.each([
  ["next-router-prefetch", "1"],
  ["next-router-segment-prefetch", "/_tree"],
  ["purpose", "prefetch"],
  ["sec-purpose", "prefetch;prerender"],
])("excludes prefetch requests: %s", (name, value) => {
  expect(isDashboardTraceRequest("/dashboard", "GET", new Headers([[name, value]]))).toBe(false);
});

it("only traces ordinary Dashboard GETs", () => {
  expect(isDashboardTraceRequest("/dashboard", "GET", new Headers())).toBe(true);
  expect(isDashboardTraceRequest("/dashboard", "POST", new Headers())).toBe(false);
  expect(isDashboardTraceRequest("/projects", "GET", new Headers())).toBe(false);
});

it("a log sink failure cannot fail a successful loader", async () => {
  vi.spyOn(console, "info").mockImplementation(() => { throw new Error("closed log sink"); });
  const trace = createDashboardTrace("test-request", Date.now());
  expect(await trace.measure("tasks", () => 42)).toBe(42);
  expect(() => trace.flush()).not.toThrow();
});

it("keeps loader completion separate from delayed log emission", async () => {
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const trace = createDashboardTrace("test-request", 1000);
  await trace.measure("dashboard.loader", () => { clock = 10; });
  clock = 100;
  trace.flush();
  expect(log.mock.calls[0][0]).toContain('"loader_complete_ms":10');
});
