import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/submissions/submissions-workspace.tsx", "utf8");

describe("submissions workspace contract", () => {
  it("provides the required inbox filters and admin views", () => {
    expect(source).toContain('["all", "mine", "request", "suggestion", "complaint", "attention", "assigned"]');
  });

  it("offers anonymous mode only when Complaint is selected", () => {
    expect(source).toContain('type === "complaint"');
    expect(source).toContain('name="anonymous"');
  });

  it("uses the shared detail drawer without task components", () => {
    expect(source).toContain("<Drawer");
    expect(source).not.toContain("TaskDetailsDrawer");
  });

  it("keeps intentional remount keys unique between sibling overlays", () => {
    expect(source).toContain('key={`submission-create-${createOpen ? "open" : "closed"}`}');
    expect(source).toContain('key={`submission-detail-${selected?.id ?? "closed"}`}');
    expect(source).not.toContain('key={createOpen ? "open" : "closed"}');
    expect(source).not.toContain('key={selected?.id ?? "closed"}');
  });

  it("does not render script markup from the Submissions client component", () => {
    expect(source).not.toMatch(/<script\b/i);
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
