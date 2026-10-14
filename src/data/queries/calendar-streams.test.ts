import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { getCalendarStreams } from "./calendar";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./active-studio-membership", () => ({ getActiveStudioMembership: async () => ({ system_role: "employee", studio_id: "studio", authenticatedUserId: "user" }) }));

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

describe("Calendar supporting streams", () => {
  it("makes the complete event snapshot available while each selector is independently pending, without repeating reads", async () => {
    const queries: URL[] = [];
    let finishProjects: (value: Response) => void = () => {};
    let finishPeople: (value: Response) => void = () => {};
    const projects = new Promise<Response>((resolve) => { finishProjects = resolve; });
    const people = new Promise<Response>((resolve) => { finishPeople = resolve; });
    const client = createClient<Database>("http://127.0.0.1:54321", "test-key", {
      auth: { persistSession: false },
      global: { fetch: async (input) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        queries.push(url);
        const select = url.searchParams.get("select") ?? "";
        if (url.pathname.endsWith("/projects") && select.includes("project_code")) return projects;
        if (url.pathname.endsWith("/studio_members") && select.includes("assignments")) return people;
        if (url.pathname.endsWith("/studio_days_off")) return json([{ id: "day-off", date: "2026-09-15", name: "Company day off", note: null }]);
        return json([]);
      } },
    });
    vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: { id: "user", aud: "authenticated", app_metadata: {}, user_metadata: { calendar_time_zone: "America/New_York", calendar_time_format: "12h" }, created_at: "2026-01-01T00:00:00Z" } }, error: null });
    mocks.createClient.mockResolvedValue(client);
    const streams = await getCalendarStreams({ start: "2026-09-14", end: "2026-09-20" });
    expect(streams).not.toBeNull();
    if (!streams) return;
    try {
      expect(await streams.preferences).toEqual({ timeFormat: "12h", timeZone: "America/New_York" });
      const data = await streams.data;
      expect(data.items).toEqual([expect.objectContaining({ source: "studio_day_off", startDate: "2026-09-15" })]);
      expect(data).toMatchObject({ currentUserId: "user", isAdmin: false, timeFormat: "12h", timeZone: "America/New_York" });
      expect(data).not.toHaveProperty("projects");
      expect(data).not.toHaveProperty("people");
      expect(client.auth.getUser).toHaveBeenCalledTimes(1);
      finishProjects(json([{ id: "project", name: "Project" }]));
      expect(await streams.projects).toEqual([expect.objectContaining({ id: "project" })]);
      let peopleReady = false;
      void streams.people.then(() => { peopleReady = true; });
      await Promise.resolve();
      expect(peopleReady).toBe(false);
      finishPeople(json([]));
      expect(await streams.people).toEqual([]);
      expect(queries.filter((url) => url.pathname.endsWith("/projects") && url.searchParams.get("select")?.includes("project_code"))).toHaveLength(1);
      expect(queries.filter((url) => url.pathname.endsWith("/studio_members") && url.searchParams.get("select")?.includes("assignments"))).toHaveLength(1);
      expect(queries.some((url) => url.pathname.includes("finance_"))).toBe(false);
    } finally {
      finishProjects(json([])); finishPeople(json([]));
    }
  });

  it("preserves supporting query failures instead of showing an empty selector", async () => {
    const client = createClient<Database>("http://127.0.0.1:54321", "test-key", {
      auth: { persistSession: false },
      global: { fetch: async (input) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return url.pathname.endsWith("/projects") && url.searchParams.get("select")?.includes("project_code")
          ? json({ message: "Unable to read projects", code: "42501" }, 403) : json([]);
      } },
    });
    vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: { id: "user", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } }, error: null });
    mocks.createClient.mockResolvedValue(client);
    const streams = await getCalendarStreams({ start: "2026-09-14", end: "2026-09-20" });
    if (!streams) throw new Error("Missing Calendar streams");
    await expect(streams.projects).rejects.toThrow("Unable to load Calendar projects.");
    await expect(streams.data).resolves.toMatchObject({ items: [] });
  });
});
