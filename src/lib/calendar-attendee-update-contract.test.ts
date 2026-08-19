import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/app/api/calendar/events/[eventId]/route.ts"), "utf8");

describe("Calendar attendee update contract", () => {
  it("diffs attendees instead of deleting and reinserting unchanged rows", () => {
    expect(route).toContain("const removedIds = [...existingIds].filter");
    expect(route).toContain("const addedIds = inviteeIds.filter");
    expect(route).toContain('from("calendar_event_invites")');
    expect(route).toContain('.in("user_id", removedIds)');
    expect(route).toContain("addedIds.map");
    expect(route).not.toContain('.delete().eq("event_id", eventId);');
  });
});
