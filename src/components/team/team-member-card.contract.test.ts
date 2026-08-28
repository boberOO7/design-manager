import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const cardPath = new URL("./team-member-card.tsx", import.meta.url);

describe("Team member card presentation", () => {
  it("uses the shared large portrait and opens uploaded photos in an accessible dialog", async () => {
    const source = await readFile(cardPath, "utf8");
    expect(source).toContain('size="directoryPortrait"');
    expect(source).toContain('aria-label={t("viewAvatar", { name: fullName })}');
    expect(source).toContain("hideHeader");
    expect(source).toContain("getAvatarOriginalImageUrl(avatarUrl)");
    expect(source).toContain("!hasFailedImage");
  });

  it("pins the role and status footer below naturally sized profile metadata", async () => {
    const source = await readFile(cardPath, "utf8");
    expect(source).toContain("flex min-w-0 w-full flex-1 flex-col pt-4");
    expect(source).toContain("mt-auto flex flex-wrap items-center justify-center");
    expect(source).toContain("relative flex h-full w-full max-w-[18.75rem] flex-col");
  });

  it("renders location and birthday metadata only when profile values exist", async () => {
    const source = await readFile(cardPath, "utf8");
    expect(source).toContain("{location ? <p");
    expect(source).toContain("{birthDate ? <p");
    expect(source).not.toContain("—");
  });
});
