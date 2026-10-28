import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ updateSession: vi.fn() }));
vi.mock("./lib/supabase/proxy", () => ({ updateSession: mocks.updateSession }));
import { proxy } from "./proxy";
it.each(["/f/" + "A".repeat(43), "/survey/" + "a".repeat(64)])("protects public survey requests without auth refresh: %s", async path => {
  const response = await proxy(new NextRequest("https://studio.example" + path));
  expect(mocks.updateSession).not.toHaveBeenCalled();
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  if (path.startsWith("/f/")) expect(response.headers.get("x-middleware-rewrite")).toBe("https://studio.example/survey/" + "A".repeat(43));
  else expect(response.headers.get("x-middleware-rewrite")).toBeNull();
});

it("allows only the authenticated preview route to embed on this origin", async () => {
  const response = await proxy(new NextRequest("https://studio.example/survey/preview"));
  expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
