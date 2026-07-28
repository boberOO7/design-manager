import { afterEach, describe, expect, it, vi } from "vitest";
import { updateTimeOffRequest } from "./time-off-request-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shared time-off mutation client", () => {
  it("sends only the action and optional review note to the shared route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, item: null, removedKey: "time_off_request_admin:r1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateTimeOffRequest("r1", "cancel", "ignored by the server for cancellation");

    expect(fetchMock).toHaveBeenCalledWith("/api/calendar/time-off/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", reviewNote: "ignored by the server for cancellation" }),
    });
  });

  it("never exposes a database error response to the caller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "42883", message: "raw database error" }), { status: 400 })));
    await expect(updateTimeOffRequest("r1", "approve")).rejects.toThrow("The request could not be updated.");
  });

  it("handles a non-JSON response with the same safe error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gateway failure", { status: 502 })));
    await expect(updateTimeOffRequest("r1", "reject")).rejects.toThrow("The request could not be updated.");
  });
});
