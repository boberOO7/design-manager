import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pagePath = new URL("./page.tsx", import.meta.url);

describe("access-unavailable page", () => {
  it("keeps authenticated users outside the workspace shell with localized copy and sign out", async () => {
    const source = await readFile(pagePath, "utf8");
    expect(source).toContain('getTranslations("AccessUnavailable")');
    expect(source).toContain("<SignOutButton />");
    expect(source).toContain('redirect("/login")');
    expect(source).toContain('redirect("/dashboard")');
  });
});
