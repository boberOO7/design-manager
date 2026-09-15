import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const editorPath = new URL("./profile-editor-dialog.tsx", import.meta.url);

describe("profile editor fields", () => {
  it("keeps personal dates together and only enables start-date editing for administrators", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).toContain('import { DatePicker } from "@/components/ui/date-picker"');
    expect(source).toContain('rpc("update_my_profile_details"');
    expect(source).toContain('aria-labelledby="profile-dates-heading"');
    expect(source).toContain('const canEditStartDate = systemRole === "admin"');
    expect(source).toContain('p_joined_at: canEditStartDate ? currentJoinedAt || undefined : undefined');
    expect(source).toContain('t("startDateManagedByAdmin")');
    expect(source).toContain('sm:grid-cols-2');
    expect(source).toContain('disabled={isProfilePending || !isProfileDirty}');
    expect(source).toContain('className="mt-4 w-full"');
  });

  it("does not retain the removed location helper copy", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).not.toContain('t("locationDescription")');
    expect(source).not.toContain('t("saveBirthday")');
    expect(source).not.toContain('t("saveLocation")');
    expect(source).not.toContain('t("clearLocation")');
  });

  it("persists independent realtime notification preferences in the profile settings surface", async () => {
    const source = await readFile(editorPath, "utf8");
    expect(source).toContain('aria-labelledby="notification-settings-heading"');
    expect(source).toContain("p_notification_popups_enabled: currentNotificationPopupsEnabled");
    expect(source).toContain("p_notification_sound_enabled: currentNotificationSoundEnabled");
    expect(source).toContain('t("notificationPopups")');
    expect(source).toContain('t("notificationSound")');
  });
});
