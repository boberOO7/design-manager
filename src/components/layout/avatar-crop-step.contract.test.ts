import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const cropStepPath = new URL("./avatar-crop-step.tsx", import.meta.url);

describe("avatar crop step contract", () => {
  it("creates a normalized square JPEG and supports repositioning", async () => {
    const source = await readFile(cropStepPath, "utf8");
    expect(source).toContain("const OUTPUT_SIZE = 512");
    expect(source).toContain("new FileReader()");
    expect(source).not.toContain("URL.createObjectURL");
    expect(source).toContain('canvas.toBlob(resolve, "image/jpeg", 0.9)');
    expect(source).toContain('new File([blob], "avatar.jpg", { type: "image/jpeg" })');
    expect(source).toContain("(CROP_SIZE - width) / 2 + offsetX");
    expect(source).toContain("(OUTPUT_SIZE - scaledWidth) / 2 + offsetX");
    expect(source).toContain("onPointerDown");
    expect(source).toContain('type="range"');
    expect(source).toContain("onConfirm(await createCroppedAvatar");
    expect(source).toContain("sourceUrl, zoom }), file)");
  });
});
