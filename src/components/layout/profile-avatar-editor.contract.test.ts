import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const editorPath = new URL("./profile-avatar-editor.tsx", import.meta.url);

describe("profile editor fields", () => {
  it("uses one shared date picker and profile update RPC", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).toContain('import { DatePicker } from "@/components/ui/date-picker"');
    expect(source).toContain('rpc("update_my_profile_details"');
    expect(source).toContain('aria-labelledby="profile-birthday-heading"');
    expect(source).toContain('disabled={isProfilePending || !isProfileDirty}');
    expect(source).toContain('className="mt-4 w-full sm:w-64"');
  });

  it("does not retain the removed location helper copy", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).not.toContain('t("locationDescription")');
    expect(source).not.toContain('t("saveBirthday")');
    expect(source).not.toContain('t("saveLocation")');
    expect(source).not.toContain('t("clearLocation")');
  });
});
