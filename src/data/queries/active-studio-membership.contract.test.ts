import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const membershipPath = new URL("./active-studio-membership.ts", import.meta.url);

describe("active studio membership resolution", () => {
  it("distinguishes unauthenticated, inactive, active, and ambiguous access states", async () => {
    const source = await readFile(membershipPath, "utf8");
    expect(source).toContain('status: "UNAUTHENTICATED"');
    expect(source).toContain('status: "NO_ACTIVE_STUDIO"');
    expect(source).toContain('status: "ACTIVE_STUDIO"');
    expect(source).toContain('status: "MULTIPLE_ACTIVE_STUDIOS"');
    expect(source).toContain('.limit(2)');
    expect(source).toContain('resolution.status === "ACTIVE_STUDIO" ? resolution.membership : null');
  });
});
