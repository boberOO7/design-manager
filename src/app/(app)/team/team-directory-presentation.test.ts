import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const teamPagePath = new URL("./page.tsx", import.meta.url);

describe("Team directory card presentation", () => {
  it("uses the shared avatar as a large circular portrait", async () => {
    const source = await readFile(teamPagePath, "utf8");
    expect(source).toContain("<TeamMemberCard");
    expect(source).toContain('sm:grid-cols-[repeat(auto-fill,minmax(16.25rem,18.75rem))]');
  });

  it("keeps optional location and system metadata subordinate to identity", async () => {
    const source = await readFile(teamPagePath, "utf8");
    expect(source).toContain("location={member.location}");
  });
});
