import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const controlsPath = new URL("./project-lifecycle-controls.tsx", import.meta.url);

describe("project completion interaction", () => {
  it("completes and reopens directly", async () => {
    const source = await readFile(controlsPath, "utf8");
    const actions = source.slice(source.indexOf("const actions"), source.indexOf("const primary"));

    expect(actions).not.toContain('confirm: t("completeConfirm")');
    expect(actions).not.toContain('confirm: t("reopenConfirm")');
    expect(source).not.toContain("window.confirm");
    expect(source).toContain('completed: [{ status: "active", label: t("reopenProject"), icon: RotateCcw }]');
  });
});
