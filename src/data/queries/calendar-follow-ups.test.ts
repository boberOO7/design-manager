import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { getCalendarData } from "./calendar";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./active-studio-membership", () => ({ getActiveStudioMembership: async () => ({ system_role: "admin", studio_id: "studio", authenticatedUserId: "user" }) }));

function json(data: unknown) { return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }); }

describe("Calendar follow-up dependencies", () => {
  it("starts linked and compensation reads without waiting for independent private review notes", async () => {
    const started: string[] = [];
    let finishReview: (value: Response) => void = () => {};
    let finishLinked: (value: Response) => void = () => {};
    const review = new Promise<Response>((resolve) => { finishReview = resolve; });
    const linked = new Promise<Response>((resolve) => { finishLinked = resolve; });
    const dayOff = { id: "own", start_date: "2026-09-15", end_date: "2026-09-15", start_time: null, end_time: null, all_day: true };
    const client = createClient<Database>("http://127.0.0.1:54321", "test-key", { auth: { persistSession: false }, global: { fetch: async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const select = url.searchParams.get("select") ?? "";
      if (url.pathname.endsWith("/time_off_request_reviews")) { started.push("review"); return review; }
      if (url.pathname.endsWith("/time_off_requests")) {
        if (url.searchParams.has("id")) { started.push("linked"); return linked; }
        if (select.includes("subject")) return json([{ ...dayOff, user_id: "user", request_type: "day_off", status: "approved", subject: { full_name: "User" } }]);
        return json([dayOff]);
      }
      if (url.pathname.endsWith("/calendar_events")) {
        if (select.includes("title")) {
          // A series override supplies a linked request ID; no root event is projected here.
          return json([{ id: "override", series_id: "root", occurrence_start: "2026-09-15T09:00:00Z", compensates_time_off_request_id: "linked" }]);
        }
        started.push("compensation");
      }
      return json([]);
    } } });
    vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: { id: "user", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } }, error: null });
    mocks.createClient.mockResolvedValue(client);
    const loading = getCalendarData({ start: "2026-09-14", end: "2026-09-20" });
    try {
      await vi.waitFor(() => expect(started).toEqual(expect.arrayContaining(["review", "linked"])));
      expect(started).not.toContain("compensation");
      finishLinked(json([{ ...dayOff, id: "linked" }]));
      await vi.waitFor(() => expect(started).toContain("compensation"));
      expect(started.filter((name) => name === "linked")).toHaveLength(1);
    } finally {
      finishLinked(json([]));
      finishReview(json([]));
      await loading;
    }
  });
});
