import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const editorPath = new URL("./profile-avatar-editor.tsx", import.meta.url);

describe("profile editor birthday", () => {
  it("uses the shared date picker and self-service birthday RPC", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).toContain('import { DatePicker } from "@/components/ui/date-picker"');
    expect(source).toContain('rpc("update_my_profile_birthday"');
    expect(source).toContain('aria-labelledby="profile-birthday-heading"');
  });

  it("does not retain the removed location helper copy", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).not.toContain('t("locationDescription")');
  });
});
