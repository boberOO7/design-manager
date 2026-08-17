import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pagePath = new URL("./page.tsx", import.meta.url);

describe("Archive route authorization", () => {
  it("redirects non-admin active studio members before loading archive data", async () => {
    const source = await readFile(pagePath, "utf8");
    expect(source).toContain('getActiveStudioMembership()');
    expect(source).toContain('membership.system_role !== "admin"');
    expect(source).toContain('redirect("/dashboard")');
    expect(source.indexOf('membership.system_role !== "admin"')).toBeLessThan(source.indexOf("await getArchivedProjects()"));
  });
});
