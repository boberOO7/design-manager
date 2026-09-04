import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/components/office/office-shell.tsx", "utf8");
const assignments = readFileSync("src/components/office/assignments-workspace.tsx", "utf8");
const legacy = readFileSync("src/app/(app)/submissions/page.tsx", "utf8");

describe("Office workspace presentation", () => {
  it("provides Overview, Submissions, and Assignments routes", () => {
    expect(shell).toContain('href: "/office"');
    expect(shell).toContain('href: "/office/submissions"');
    expect(shell).toContain('href: "/office/assignments"');
  });

  it("offers assignment creation only to admins", () => {
    expect(shell).toContain("isAdmin ?");
    expect(shell).toContain("/office/assignments?create=assignment");
    expect(assignments).toContain("createRequested && isAdmin");
  });

  it("keeps stable component-specific overlay keys", () => {
    expect(assignments).toContain('assignment-create-${createOpen ? "open" : "closed"}');
    expect(assignments).toContain('assignment-detail-${selected?.id ?? "closed"}');
  });

  it("redirects legacy submission entry points into Office", () => {
    expect(legacy).toContain("/office/submissions");
    expect(legacy).toContain('query.set("item", params.item)');
  });
});
