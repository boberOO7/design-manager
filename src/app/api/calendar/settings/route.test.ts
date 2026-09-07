import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calendarSettingsSchema } from "@/lib/validation/calendar";

const route = readFileSync(resolve(process.cwd(), "src/app/api/calendar/settings/route.ts"), "utf8");
const calendarQuery = readFileSync(resolve(process.cwd(), "src/data/queries/calendar.ts"), "utf8");

describe("Calendar settings persistence contract", () => {
  it("accepts only supported calendar time formats", () => {
    expect(calendarSettingsSchema.safeParse({ timeFormat: "24h" }).success).toBe(true);
    expect(calendarSettingsSchema.safeParse({ timeFormat: "12h" }).success).toBe(true);
    expect(calendarSettingsSchema.safeParse({ timeFormat: "locale" }).success).toBe(false);
  });

  it("verifies the authenticated user and updates their own Auth preference", () => {
    expect(route).toContain("supabase.auth.getUser()");
    expect(route).toContain("membership.authenticatedUserId !== user.id");
    expect(route).toContain("supabase.auth.updateUser({ data: { calendar_time_format: parsed.data.timeFormat } })");
  });

  it("loads the verified user's metadata and normalizes a missing preference to 24-hour time", () => {
    expect(calendarQuery).toContain("const calendarPreferencePromise = supabase.auth.getUser()");
    expect(calendarQuery).toContain("normalizeCalendarTimeFormat(calendarPreferenceResult.data.user?.user_metadata.calendar_time_format)");
  });
});
