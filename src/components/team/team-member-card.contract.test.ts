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
});
