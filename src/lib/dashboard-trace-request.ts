export const DASHBOARD_TRACE_ID_HEADER = "x-studioflow-dashboard-trace-id";
export const DASHBOARD_TRACE_START_HEADER = "x-studioflow-dashboard-trace-start";

export function isDashboardTraceRequest(pathname: string, method: string, headers: Headers) {
  return pathname === "/dashboard" && method === "GET"
    && !headers.has("next-router-prefetch")
    && !headers.has("next-router-segment-prefetch")
    && ![headers.get("purpose"), headers.get("sec-purpose")].some(value => value?.toLowerCase().includes("prefetch"));
}
