import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "./client";

afterEach(() => vi.unstubAllEnvs());

describe("Supabase browser client during SSR", () => {
  it("can initialize and read an empty session without document", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    expect(typeof document).toBe("undefined");
    const { data, error } = await createClient().auth.getSession();
    expect(error).toBeNull();
    expect(data.session).toBeNull();
  });
});
