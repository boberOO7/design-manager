import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getFeedbackSourceHash } from "./feedback-rate-limit";

const token = "a".repeat(64);
const request = (headers: Record<string, string> = {}) => new Request("https://studio.example/api/feedback/" + token, { headers });
afterEach(() => vi.unstubAllEnvs());

describe("feedback submission source", () => {
  it("uses a stable private hash scoped to the link and Vercel client IP", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-secret");
    const input = request({ "x-vercel-forwarded-for": "203.0.113.1" });
    const hash = getFeedbackSourceHash(input, token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(getFeedbackSourceHash(input, token)).toBe(hash);
    expect(getFeedbackSourceHash(request({ "x-vercel-forwarded-for": "203.0.113.2" }), token)).not.toBe(hash);
    expect(getFeedbackSourceHash(input, "b".repeat(64))).not.toBe(hash);
    expect(getFeedbackSourceHash(request({ "x-vercel-forwarded-for": "203.0.113.1", "x-forwarded-for": "spoofed", "x-real-ip": "198.51.100.1" }), token)).toBe(hash);
  });
  it("canonicalizes equivalent IPv6 addresses", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-secret");
    expect(getFeedbackSourceHash(request({ "x-vercel-forwarded-for": "2001:db8:0:0:0:0:0:1" }), token))
      .toBe(getFeedbackSourceHash(request({ "x-vercel-forwarded-for": "2001:db8::1" }), token));
  });
  it.each(["", "198.51.100.1, 203.0.113.1", "spoofed"]) ("uses a shared fallback for missing or invalid trusted addresses: %s", value => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-secret");
    expect(getFeedbackSourceHash(request({ "x-vercel-forwarded-for": value, "x-forwarded-for": "198.51.100.1" }), token))
      .toBe(getFeedbackSourceHash(request(), token));
  });
  it("ignores caller-supplied forwarding headers outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-secret");
    expect(getFeedbackSourceHash(request({ "x-vercel-forwarded-for": "203.0.113.1", "x-forwarded-for": "198.51.100.1" }), token))
      .toBe(getFeedbackSourceHash(request(), token));
  });
  it("requires a server secret instead of an unhashed address fallback", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(() => getFeedbackSourceHash(request(), token)).toThrow("SUPABASE_SECRET_KEY");
  });
});
