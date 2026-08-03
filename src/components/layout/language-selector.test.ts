import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const selectorPath = new URL("./language-selector.tsx", import.meta.url);

describe("language selector", () => {
  it("uses one accessible toggle button without select semantics", async () => {
    const source = await readFile(selectorPath, "utf8");
    expect(source).toContain("<ShellControl");
    expect(source).toContain('locale === "en" ? "uk" : "en"');
    expect(source).toContain('locale === "en" ? "EN" : "УКР"');
    expect(source).toContain("aria-label={label}");
    expect(source).not.toContain("<select");
    expect(source).not.toContain("<option");
  });
});
