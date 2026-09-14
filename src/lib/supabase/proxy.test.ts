import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const proxyPath = new URL("./proxy.ts", import.meta.url);

describe("Supabase SSR session proxy", () => {
  it("validates with getClaims and forwards refreshed cookies and cache headers", async () => {
    const source = await readFile(proxyPath, "utf8");

    expect(source).toContain("await supabase.auth.getClaims()");
    expect(source).not.toContain("supabase.auth.getUser()");
    expect(source).not.toContain("supabase.auth.signOut(");
    expect(source).toContain("setAll(cookiesToSet, headers)");
    expect(source).toContain("request.cookies.set(name, value)");
    expect(source).toContain("response.cookies.set(name, value, options)");
    expect(source).toContain("response.headers.set(name, value)");
  });
});
