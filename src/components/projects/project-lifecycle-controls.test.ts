import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const controlsPath = new URL("./project-lifecycle-controls.tsx", import.meta.url);

describe("project completion interaction", () => {
  it("completes directly while preserving confirmation for reopening", async () => {
    const source = await readFile(controlsPath, "utf8");
    const actions = source.slice(source.indexOf("const actions"), source.indexOf("const primary"));

    expect(actions).not.toContain('confirm: t("completeConfirm")');
    expect(actions).toContain('confirm: t("reopenConfirm")');
    expect(source).toContain("if (confirmation && !window.confirm(confirmation)) return;");
  });
});
