export const PROJECTS_PREFETCH_HEADER = "x-studioflow-projects-prefetch";

export function isProjectsPrefetchRequest(pathname: string, method: string, headers: Headers) {
  return pathname === "/projects" && method === "GET" &&
    (headers.has("next-router-prefetch") || headers.get("purpose") === "prefetch");
}
