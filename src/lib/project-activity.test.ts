import { describe, expect, it } from "vitest";
import { formatRelativeTime, getActivityChange, getActivityMemberId, getActivityMemberIds, groupActivityByLocalDate, isUuid } from "./project-activity";

describe("project activity presentation", () => {
  it("keeps newest-first input grouped by local calendar date", () => {
    const items = [
      { id: "new", created_at: "2026-07-29T13:00:00.000Z" },
      { id: "old", created_at: "2026-07-28T13:00:00.000Z" },
    ];
    const groups = groupActivityByLocalDate(items);
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toEqual(["new", "old"]);
  });

  it("preserves structured old-to-new values for localized rendering", () => {
    expect(getActivityChange({ status: { from: "todo", to: "in_progress" } })).toEqual({ field: "status", from: "todo", to: "in_progress" });
  });

  it("uses compact relative time alongside an exact timestamp in the UI", () => {
    expect(formatRelativeTime("2026-07-29T11:59:00.000Z", new Date("2026-07-29T12:00:00.000Z"))).toBe("1m ago");
  });

  it("extracts a member identifier only from activity member metadata", () => {
    expect(getActivityMemberId({ member_id: "cda54ad0-0000-0000-0000-000000000000" })).toBe("cda54ad0-0000-0000-0000-000000000000");
    expect(getActivityMemberId({ status: { from: "todo", to: "in_progress" } })).toBeNull();
  });

  it("collects every assignee identifier needed to resolve historical changes", () => {
    expect(getActivityMemberIds({ assignee_id: { from: "old-member", to: "new-member" } })).toEqual(["old-member", "new-member"]);
  });

  it("recognizes identifiers that must never be rendered as activity values", () => {
    expect(isUuid("cda54ad0-0000-4000-8000-000000000000")).toBe(true);
  });
});
