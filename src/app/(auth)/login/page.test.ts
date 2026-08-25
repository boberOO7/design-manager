import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pagePath = new URL("./page.tsx", import.meta.url);

describe("login session redirect", () => {
  it("redirects to the dashboard only after browser auth has verified the user", async () => {
    const source = await readFile(pagePath, "utf8");

    expect(source).toContain("supabase.auth.getUser()");
    expect(source).toContain("if (!userError && user)");
    expect(source).not.toContain("supabase.auth.getSession()");
    expect(source).toContain('router.push("/dashboard")');
  });
});
