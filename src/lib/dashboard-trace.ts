import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { DASHBOARD_TRACE_ID_HEADER, DASHBOARD_TRACE_START_HEADER } from "./dashboard-trace-request";

type Span = {
  stage: string;
  start_ms: number;
  duration_ms: number | null;
  completion_ms: number | null;
  outcome: "pending" | "resolved" | "rejected";
};
const round = (value: number) => Math.round(value * 100) / 100;

// Temporary, opt-in timings only: never attach query inputs, results, or errors.
export function createDashboardTrace(requestId: string, requestStartedAt: number) {
  const origin = performance.now();
  const initialOffset = Math.max(0, Date.now() - requestStartedAt);
  const offset = () => initialOffset + performance.now() - origin;
  const spans: Span[] = [];
  return {
    async measure<T>(stage: string, work: () => T | PromiseLike<T>): Promise<T> {
      const start = offset();
      const span: Span = { stage, start_ms: round(start), duration_ms: null, completion_ms: null, outcome: "pending" };
      spans.push(span);
      try {
        const result = await work();
        span.outcome = "resolved";
        return result;
      } catch (error) {
        span.outcome = "rejected";
        throw error;
      } finally {
        const end = offset();
        span.duration_ms = round(end - start);
        span.completion_ms = round(end);
      }
    },
    flush() {
      const loader = spans.find(span => span.stage === "dashboard.loader");
      const branches = spans.filter(span => ["tasks", "administration", "operations"].includes(span.stage));
      const completed = branches.filter(span => span.completion_ms !== null);
      const last = completed.reduce<Span | null>((latest, span) => !latest || span.completion_ms! > latest.completion_ms! ? span : latest, null);
      // Completion offsets identify the last ready branch; overlapping durations must not be summed.
      try {
        console.info(JSON.stringify({
          event: "studioflow.dashboard.trace", version: 1, request_id: requestId,
          scope: "proxy_to_dashboard_loader", loader_complete_ms: loader?.completion_ms ?? null,
          critical_branch: branches.length === completed.length ? last?.stage ?? null : null,
          parallel_window_ms: completed.length === branches.length && last
            ? round(last.completion_ms! - Math.min(...branches.map(span => span.start_ms))) : null,
          spans,
        }));
      } catch { /* Observability must never fail the request. */ }
    },
  };
}

// React cache shares the collector with auth/layout work begun before the page.
export const getDashboardTrace = cache(async () => {
  if (process.env.STUDIOFLOW_DASHBOARD_TRACE !== "1") return null;
  const requestHeaders = await headers();
  const id = requestHeaders.get(DASHBOARD_TRACE_ID_HEADER);
  const start = Number(requestHeaders.get(DASHBOARD_TRACE_START_HEADER));
  return id && /^[a-f0-9-]{36}$/.test(id) && Number.isFinite(start) && start > 0
    ? createDashboardTrace(id, start) : null;
});

export async function traceDashboardStage<T>(stage: string, work: () => T | PromiseLike<T>): Promise<T> {
  if (process.env.STUDIOFLOW_DASHBOARD_TRACE !== "1") return work();
  const trace = await getDashboardTrace();
  return trace ? trace.measure(stage, work) : work();
}
