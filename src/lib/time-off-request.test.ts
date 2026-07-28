import { describe, expect, it } from "vitest";
import { deriveTimeOffUpdate, timeOffUpdateFields } from "./time-off-request";

const base = {
  action: "approve" as const,
  actorId: "admin-1",
  actorRole: "admin" as const,
  ownerId: "employee-1",
  currentStatus: "pending" as const,
  reviewNote: null,
  now: "2026-07-28T22:58:25.000Z",
};

describe("canonical server time-off transitions", () => {
  it("derives trusted reviewer fields for admin approval", () => {
    const update = deriveTimeOffUpdate({ ...base, action: "approve", reviewNote: "Approved" });
    expect(update).toEqual({
      status: "approved",
      reviewed_by: "admin-1",
      reviewed_at: base.now,
      review_note: "Approved",
    });
    expect(update && timeOffUpdateFields(update)).toEqual(["review_note", "reviewed_at", "reviewed_by", "status"]);
  });

  it("derives trusted reviewer fields for admin rejection", () => {
    expect(deriveTimeOffUpdate({ ...base, action: "reject" })).toMatchObject({
      status: "rejected",
      reviewed_by: "admin-1",
      reviewed_at: base.now,
    });
  });

  it("allows an employee to cancel only their own pending request", () => {
    expect(deriveTimeOffUpdate({ ...base, action: "cancel", actorId: "employee-1", actorRole: "employee" })).toEqual({ status: "cancelled", cancelled_at: base.now });
    expect(deriveTimeOffUpdate({ ...base, action: "cancel", actorId: "employee-2", actorRole: "employee" })).toBeNull();
  });

  it("rejects employee approval and rejection", () => {
    expect(deriveTimeOffUpdate({ ...base, actorId: "employee-1", actorRole: "employee", action: "approve" })).toBeNull();
    expect(deriveTimeOffUpdate({ ...base, actorId: "employee-1", actorRole: "employee", action: "reject" })).toBeNull();
  });

  it("allows an admin to cancel pending and reviewed requests", () => {
    expect(deriveTimeOffUpdate({ ...base, action: "cancel" })).toEqual({ status: "cancelled", cancelled_at: base.now });
    expect(deriveTimeOffUpdate({ ...base, action: "cancel", currentStatus: "approved" })).toEqual({ status: "cancelled", cancelled_at: base.now });
    expect(deriveTimeOffUpdate({ ...base, action: "cancel", currentStatus: "rejected" })).toEqual({ status: "cancelled", cancelled_at: base.now });
  });

  it("cannot rewrite a reviewed decision or restore a cancelled request", () => {
    expect(deriveTimeOffUpdate({ ...base, action: "reject", currentStatus: "approved" })).toBeNull();
    expect(deriveTimeOffUpdate({ ...base, action: "approve", currentStatus: "cancelled" })).toBeNull();
    expect(deriveTimeOffUpdate({ ...base, action: "cancel", currentStatus: "cancelled" })).toBeNull();
  });
});
