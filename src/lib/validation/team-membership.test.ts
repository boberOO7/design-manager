import { describe, expect, it } from "vitest";
import { getStudioMemberActionInput, studioMemberActionSchema } from "./team-membership";

const taskId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

describe("studio member removal input", () => {
  it("supports independent task reassignment decisions and deliberate unassignment", () => {
    const form = new FormData();
    form.set("user_id", memberId);
    form.set("allow_unassigned", "true");
    form.set("reassignments", JSON.stringify([{ taskId, assigneeId: memberId }]));
    expect(studioMemberActionSchema.safeParse(getStudioMemberActionInput(form)).success).toBe(true);
  });

  it("rejects malformed reassignment instructions before the RPC", () => {
    const form = new FormData();
    form.set("user_id", memberId);
    form.set("allow_unassigned", "false");
    form.set("reassignments", "not-json");
    expect(studioMemberActionSchema.safeParse(getStudioMemberActionInput(form)).success).toBe(false);
  });
});
