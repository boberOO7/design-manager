import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const controlsPath = new URL("./studio-member-lifecycle-controls.tsx", import.meta.url);

describe("Studio member removal controls", () => {
  it("uses StudioFlow select and destructive-action primitives for the removal form", async () => {
    const source = await readFile(controlsPath, "utf8");
    expect(source).toContain('import { Select, SelectItem } from "@/components/ui/select"');
    expect(source).toContain('sm:grid-cols-[minmax(0,1fr)_22rem]');
    expect(source).toContain('sm:grid-cols-[minmax(0,1fr)_auto]');
    expect(source).toContain('width="content"');
    expect(source).toContain('min-w-[12.5rem] max-w-full');
    expect(source).toContain('focus-within:border-[var(--ui-focus)]');
    expect(source).toContain('bg-[var(--ui-action-danger)]');
    expect(source).toContain('disabled:bg-[var(--ui-surface-muted)]');
  });
});
