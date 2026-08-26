import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pagePath = new URL("./page.tsx", import.meta.url);

describe("calendar page view selection", () => {
  it("uses Week as the default view and query range fallback", async () => {
    const source = await readFile(pagePath, "utf8");

    expect(source).toContain('params.view : "week"');
    expect(source).toContain('requestedView === "month" || requestedView === "week" || requestedView === "agenda" ? requestedView : "week"');
    expect(source).toContain("const range = getCalendarRange(view, date)");
  });
});
