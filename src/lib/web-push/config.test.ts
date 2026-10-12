import { afterEach, describe, expect, it, vi } from "vitest";
import { generateVAPIDKeys } from "web-push";
vi.mock("server-only", () => ({}));
import { getWebPushConfig } from "./config";

afterEach(() => vi.unstubAllEnvs());
describe("VAPID configuration", () => {
  it("accepts a matching pair and rejects a well-shaped mismatched private key", () => {
    const pair = generateVAPIDKeys();
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", pair.publicKey);
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", pair.privateKey);
    vi.stubEnv("WEB_PUSH_VAPID_SUBJECT", "mailto:admin@example.test");
    vi.stubEnv("CRON_SECRET", "worker-secret");
    expect(getWebPushConfig()).toEqual({ ...pair, subject: "mailto:admin@example.test" });
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", generateVAPIDKeys().privateKey);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(getWebPushConfig()).toBeNull();
      expect(warning).toHaveBeenCalledExactlyOnceWith("Web Push configuration invalid.", { reason: "vapid_key_pair_mismatch" });
    } finally { warning.mockRestore(); }
  });
});
