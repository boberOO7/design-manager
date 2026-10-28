import { describe, expect, it } from "vitest";
import { feedbackStatus, getFeedbackSurveyPath, resolveFeedbackLinkToken, getFeedbackExpiryAt } from "./feedback";
describe("feedback invitation status", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  const invitation = { submitted_at: null, revoked_at: null, expires_at: "2026-10-29T12:00:00Z" };
  it("keeps a submitted response answered after expiry", () => expect(feedbackStatus({ ...invitation, expires_at: "2026-10-01T12:00:00Z", submitted_at: "2026-09-30T12:00:00Z" }, now)).toBe("answered"));
  it("treats the expiry instant as expired", () => expect(feedbackStatus({ ...invitation, expires_at: new Date(now).toISOString() }, now)).toBe("expired"));
  it("shows revocation regardless of expiry", () => expect(feedbackStatus({ ...invitation, revoked_at: new Date(now).toISOString() }, now)).toBe("revoked"));
  it("shows a valid invitation as pending", () => expect(feedbackStatus(invitation, now)).toBe("pending"));
});

describe("compact feedback links", () => {
  it.each(["00".repeat(32), "ff".repeat(32), "0123456789abcdef".repeat(4)])("preserves all 256 bits and accepts existing links", token => {
    const path = getFeedbackSurveyPath(token);
    expect(path).toMatch(/^\/f\/[A-Za-z0-9_-]{43}$/);
    expect(resolveFeedbackLinkToken(path.slice(3))).toBe(token);
    expect(resolveFeedbackLinkToken(token)).toBe(token);
  });
  it.each(["", "a".repeat(42), "a".repeat(44), "a".repeat(63), "../survey/test", "_".repeat(43)])("rejects malformed or noncanonical tokens", token => {
    expect(resolveFeedbackLinkToken(token)).toBeNull();
  });
});

describe("end of selected feedback day in Kyiv", () => {
  it("expires at the next midnight, not a browser-dependent hour", () => {
    expect(getFeedbackExpiryAt("2026-11-27")).toBe("2026-11-27T22:00:00.000Z");
  });
  it("follows daylight-saving transitions", () => {
    expect(getFeedbackExpiryAt("2026-03-29")).toBe("2026-03-29T21:00:00.000Z");
    expect(getFeedbackExpiryAt("2026-10-25")).toBe("2026-10-25T22:00:00.000Z");
  });
  it.each(["", "2026-02-30", "2026-11-27T12:00", "invalid"])("rejects invalid dates", value => {
    expect(getFeedbackExpiryAt(value)).toBeNull();
  });
});
