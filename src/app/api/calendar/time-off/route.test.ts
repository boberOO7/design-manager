import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { timeOffRequestSchema } from "@/lib/validation/calendar";

const route = readFileSync(resolve(process.cwd(), "src/app/api/calendar/time-off/route.ts"), "utf8");

const request = { requestType: "vacation", startDate: "2026-09-24", endDate: "2026-09-24", allDay: true, privateNote: "" };

describe("self-service absence ownership", () => {
  it("does not accept a supplied employee for any self-service absence type", () => {
    for (const requestType of ["vacation", "sick_leave", "day_off"] as const) {
      const payload = { ...request, requestType, privateNote: requestType === "vacation" ? "" : "Reason" };
      expect(timeOffRequestSchema.safeParse(payload).success).toBe(true);
      expect(timeOffRequestSchema.safeParse({ ...payload, userId: "a9000000-0000-0000-0000-000000000013" }).success).toBe(false);
    }
  });

  it("persists the authenticated member as the request owner", () => {
    expect(route).toContain("user_id: membership.authenticatedUserId");
    expect(route).not.toContain("parsed.data.userId");
  });
});
