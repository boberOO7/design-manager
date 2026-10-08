import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCalendarInvitationErrorKey } from "@/lib/calendar-invitation-error";
import en from "../../../../../../messages/en.json";
import uk from "../../../../../../messages/uk.json";

const mocks = vi.hoisted(() => ({ client: vi.fn(), getUser: vi.fn(), membership: vi.fn(), from: vi.fn(), normalize: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/data/queries/active-studio-membership", () => ({ getActiveStudioMembership: mocks.membership }));
vi.mock("@/data/queries/calendar-item", () => ({ getNormalizedCalendarEvent: mocks.normalize }));
vi.mock("@/lib/google-calendar/queue", () => ({ scheduleGoogleCalendarReconciliation: mocks.reconcile }));
import { PATCH } from "./route";

const inviteId = "bed28a5b-b4b4-40dc-8574-1eac4ec3eb31";
const eventId = "5b00eeb9-eb38-49f0-85b2-567db4d6d5e2";
const userId = "21000000-0000-0000-0000-000000000010";
const studioId = "21000000-0000-0000-0000-000000000001";
const query = { update: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
const respond = (body: unknown = { status: "accepted" }, id = inviteId) => PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ inviteId: id }) });
const savedItem = { source: "calendar_event", id: eventId };

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  vi.clearAllMocks();
  query.maybeSingle.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.membership.mockResolvedValue({ authenticatedUserId: userId, studio_id: studioId });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
  mocks.from.mockReturnValue(query);
  mocks.normalize.mockResolvedValue(savedItem);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("Calendar invitation RSVP", () => {
  it("requires verified authentication before accessing invitations", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await respond();
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe("INVITATION_AUTH_REQUIRED");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([null, { authenticatedUserId: "another-user", studio_id: studioId }])("requires the authenticated user's active studio membership (%j)", async (membership) => {
    mocks.membership.mockResolvedValue(membership);
    expect((await respond()).status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([{ status: "pending" }, { status: "accepted", userId }, {}])("rejects invalid response bodies (%j) before writing", async (body) => {
    expect((await respond(body)).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and invitation IDs before writing", async () => {
    const malformed = new Request("http://localhost", { method: "PATCH", body: "{" });
    expect((await PATCH(malformed, { params: Promise.resolve({ inviteId }) })).status).toBe(400);
    expect((await respond({ status: "accepted" }, "not-a-uuid")).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["accepted", "declined"])("saves a changed RSVP as %s using the caller's own row", async (status) => {
    query.maybeSingle.mockResolvedValueOnce({ data: { event_id: eventId }, error: null });
    const response = await respond({ status });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, item: savedItem });
    expect(query.update).toHaveBeenCalledWith({ status, responded_at: expect.any(String) });
    expect(query.eq).toHaveBeenCalledWith("id", inviteId);
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(query.neq).toHaveBeenCalledWith("status", status);
    expect(mocks.reconcile).toHaveBeenCalledOnce();
    expect(mocks.normalize).toHaveBeenCalledWith(eventId);
  });

  it.each(["accepted", "declined"])("treats a repeated %s response as success without rewriting its timestamp", async (status) => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    query.maybeSingle.mockResolvedValueOnce({ data: { event_id: eventId, event: { studio_id: studioId, cancelled_at: null } }, error: null });
    const response = await respond({ status });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, item: savedItem });
    expect(query.update).toHaveBeenCalledOnce();
    expect(query.eq.mock.calls.slice(2)).toEqual([["id", inviteId], ["user_id", userId], ["status", status], ["event.studio_id", studioId]]);
    expect(query.select).toHaveBeenLastCalledWith("event_id, event:calendar_events!inner(studio_id, cancelled_at)");
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it.each([null, { event_id: eventId, event: { studio_id: studioId, cancelled_at: "2026-10-08T10:00:00Z" } }])("does not accept a missing, hidden, other-user or cancelled invitation (%j)", async (data) => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    query.maybeSingle.mockResolvedValueOnce({ data, error: null });
    const response = await respond();
    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("INVITATION_UNAVAILABLE");
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("reports the cancellation trigger as an unavailable invitation", async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Event invitations are unavailable", details: "internal", hint: "internal" } });
    const response = await respond();
    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("INVITATION_UNAVAILABLE");
    expect(console.error).toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it.each(["update", "read"] as const)("logs a %s database error privately and does not mask it as a bad request", async (phase) => {
    if (phase === "read") query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "internal table permission failure", details: "private detail", hint: "private hint" } });
    const response = await respond();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.errorCode).toBe("INVITATION_RESPONSE_FAILED");
    expect(JSON.stringify(body)).not.toMatch(/internal|private|42501/);
    expect(console.error).toHaveBeenCalledWith("calendar invitation response error", expect.objectContaining({ phase, inviteId, userId, code: "42501" }));
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});

it("uses only localized, allowed invitation errors and ignores raw server messages", () => {
  const cases = [
    ["INVITATION_AUTH_REQUIRED", "invitationAuthRequired"],
    ["INVITATION_UNAVAILABLE", "invitationUnavailable"],
    ["INVITATION_RESPONSE_FAILED", "invitationResponseFailed"],
  ] as const;
  for (const [errorCode, key] of cases) {
    expect(getCalendarInvitationErrorKey({ errorCode, error: "private database details" })).toBe(key);
    expect(en.Notifications[key]).toBeTruthy();
    expect(uk.Notifications[key]).toBeTruthy();
  }
  for (const result of [null, "private details", { error: "private details" }, { errorCode: "unknown" }]) {
    expect(getCalendarInvitationErrorKey(result)).toBe("invitationResponseFailed");
  }
});
