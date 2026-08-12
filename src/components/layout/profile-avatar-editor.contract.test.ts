import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const editorPath = new URL("./profile-avatar-editor.tsx", import.meta.url);
const cityComboboxPath = new URL("../projects/city-combobox.tsx", import.meta.url);

describe("profile location editor layout contract", () => {
  it("defaults an unsaved country to Ukraine without changing the persistence path", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).toContain('useState(initialCountryCode ?? "UA")');
    expect(source).toContain('p_country_code: currentCountryCode || null');
  });

  it("keeps country and city in one responsive control row", async () => {
    const [editor, cityCombobox] = await Promise.all([
      readFile(editorPath, "utf8"),
      readFile(cityComboboxPath, "utf8"),
    ]);
    expect(editor).toContain("grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3");
    expect(editor).toContain('<CityCombobox className="mt-0"');
    expect(cityCombobox).toContain("className?: string;");
    expect(cityCombobox).toContain('cn("relative mt-2", className)');
  });
});

describe("profile avatar crop contract", () => {
  it("validates the source before presenting the crop step", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).toContain("getAvatarFileValidationError(file)");
    expect(source).toContain("setCropFile(file)");
    expect(source).toContain("<AvatarCropStep file={cropFile}");
    expect(source).toContain("getAvatarOriginalPath(newAvatarPath)");
    expect(source).toContain(".avatar.${getFileExtension(file)}");
    expect(source).toContain("removeAvatarObjects(supabase.storage.from(AVATAR_BUCKET), newAvatarPath)");
  });

  it("cleans the captured old path only after profile persistence succeeds", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source.indexOf("const oldAvatarPath = currentAvatarUrl")).toBeLessThan(source.indexOf("await persistAvatar(newAvatarPath)"));
    expect(source.indexOf("await persistAvatar(newAvatarPath)")).toBeLessThan(source.indexOf("await removeAvatarObjects(supabase.storage.from(AVATAR_BUCKET), oldAvatarPath)"));
    expect(source).toContain("await removeAvatarObjects(supabase.storage.from(AVATAR_BUCKET), newAvatarPath)");
    expect(source).toContain("await persistAvatar(null)");
    expect(source).toContain("await removeAvatarObjects(createClient().storage.from(AVATAR_BUCKET), oldAvatarPath)");
    expect(source).not.toContain("void supabase.storage.from(AVATAR_BUCKET).remove");
  });
});
