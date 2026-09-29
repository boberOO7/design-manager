import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./session-cookie-policy";

describe("auth cookie persistence", () => {
  it("keeps remembered cookies persistent, session cookies temporary, and deletions intact", () => {
    const options = { path: "/", sameSite: "lax" as const, maxAge: 400 * 24 * 60 * 60, expires: new Date("2030-01-01") };
    expect(authCookieOptions(options, false)).toEqual(options);
    expect(authCookieOptions(options, true)).toEqual({ path: "/", sameSite: "lax" });
    expect(authCookieOptions({ ...options, maxAge: 0 }, true)).toEqual({ ...options, maxAge: 0 });
  });
});
