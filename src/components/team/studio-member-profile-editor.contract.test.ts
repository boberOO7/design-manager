import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const editorPath = new URL("./studio-member-profile-editor.tsx", import.meta.url);
const controlsPath = new URL("./studio-member-lifecycle-controls.tsx", import.meta.url);

describe("studio member profile editor", () => {
  it("uses the existing dialog, select, action-state, and route-refresh patterns", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).toContain('import { Dialog } from "@/components/ui/dialog"');
    expect(source).toContain('import { Select, SelectItem } from "@/components/ui/select"');
    expect(source).toContain('import { DatePicker } from "@/components/ui/date-picker"');
    expect(source).toContain("useActionState<StudioMemberProfileActionState, FormData>");
    expect(source).toContain("router.refresh()");
    expect(source).toContain("hasRefreshedAfterSave.current");
    expect(source).toContain('name="systemRole"');
    expect(source).toContain('name="joinedAt"');
    expect(source).toContain('name="birthDate"');
  });

  it("adds Edit profile alongside the existing active-member overflow actions", async () => {
    const source = await readFile(controlsPath, "utf8");
    expect(source).toContain('t("editProfile")');
    expect(source).toContain("setProfileDialogOpen(true)");
    expect(source).toContain("canEditProfile && profileDialogOpen");
    expect(source).toContain("removeFromStudio");
  });

  it("keeps country and city as plain fields in the existing two-column form grid", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).toContain('className="grid gap-4 sm:grid-cols-2"');
    expect(source).toContain('name="countryCode"');
    expect(source).toContain('name="city"');
    expect(source).toContain("<CityCombobox");
    expect(source).not.toContain("Місце перебування");
  });
});
