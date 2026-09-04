import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/ui/dialog.tsx", "utf8");

describe("Dialog focus management", () => {
  it("prefers the first meaningful control and keeps the panel outline-free", () => {
    expect(source).toContain('querySelector<HTMLElement>("[data-dialog-initial-focus]")');
    expect(source).toContain("focus-visible:outline-none");
  });

  it("handles nested dialog keys before an underlying drawer", () => {
    expect(source).toContain('addEventListener("keydown", handleKeyDown, true)');
    expect(source).toContain('removeEventListener("keydown", handleKeyDown, true)');
  });
});
