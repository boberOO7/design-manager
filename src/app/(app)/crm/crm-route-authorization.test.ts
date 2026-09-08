import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const layoutPath = new URL("./layout.tsx", import.meta.url);

describe("CRM route authorization", () => {
  it("redirects non-admins before rendering CRM routes", async () => {
    const source = await readFile(layoutPath, "utf8");
    expect(source).toContain("getActiveStudioMembership()");
    expect(source).toContain('membership.system_role !== "admin"');
    expect(source).toContain('redirect("/dashboard")');
    expect(source.indexOf('membership.system_role !== "admin"')).toBeLessThan(source.indexOf("<CrmShell>"));
  });
});
