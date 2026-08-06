import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const loginPath = new URL("../app/(auth)/login/page.tsx", import.meta.url);
const recoveryPath = new URL("../components/auth/forgot-password-form.tsx", import.meta.url);
const resetPath = new URL("../components/auth/set-password-form.tsx", import.meta.url);

describe("authentication autocomplete contract", () => {
  it("keeps semantic login autocomplete tokens", async () => {
    const source = await readFile(loginPath, "utf8");
    expect(source).toContain('type="email" autoComplete="email"');
    expect(source).toContain('type="password" autoComplete="current-password"');
    expect(source).not.toContain('<form autoComplete="off"');
  });

  it("keeps password recovery and reset compatible with password managers", async () => {
    const [recovery, reset] = await Promise.all([readFile(recoveryPath, "utf8"), readFile(resetPath, "utf8")]);
    expect(recovery).toContain('autoComplete="email"');
    expect(reset.match(/autoComplete="new-password"/g)).toHaveLength(2);
  });
});
