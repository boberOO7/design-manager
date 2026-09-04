import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/components/office/office-shell.tsx", "utf8");
const assignments = readFileSync("src/components/office/assignments-workspace.tsx", "utf8");
const overview = readFileSync("src/app/(app)/office/page.tsx", "utf8");
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

  it("uses dense clickable assignment cards and shared drawer controls", () => {
    expect(assignments).toContain('lg:grid-cols-2');
    expect(assignments).toContain('className="absolute inset-0');
    expect(assignments).toContain("<DatePicker");
    expect(assignments).toContain("<Select");
    expect(assignments).not.toContain('<Input type="date"');
    expect(assignments).not.toContain("<select className=");
  });

  it("uses canonical avatars for assignment people", () => {
    expect(assignments).toContain("<UserAvatar");
    expect(assignments).toContain('size="sm"');
  });

  it("shows safe identity cues in recent activity", () => {
    expect(overview).toContain("<UserAvatar");
    expect(overview).toContain("<LockKeyhole");
    expect(overview).toContain("item.isAnonymous ? null : item.author");
  });
});
