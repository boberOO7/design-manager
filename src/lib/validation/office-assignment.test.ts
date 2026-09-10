import { describe, expect, it } from "vitest";
import { createOfficeAssignmentSchema, manageOfficeAssignmentSchema } from "./office-assignment";

const responsibleId = "00000000-0000-4000-8000-000000000001";

describe("office assignment validation", () => {
  it("requires a valid priority when creating an assignment", () => {
    const input = { title: "Order supplies", description: "", responsibleId, deadline: "" };
    expect(createOfficeAssignmentSchema.safeParse(input).success).toBe(false);
    expect(createOfficeAssignmentSchema.safeParse({ ...input, priority: "normal" }).success).toBe(true);
  });

  it("keeps priority required while allowing no deadline", () => {
    const input = { assignmentId: responsibleId, status: "assigned", responsibleId, deadline: null };
    expect(manageOfficeAssignmentSchema.safeParse(input).success).toBe(false);
    expect(manageOfficeAssignmentSchema.safeParse({ ...input, priority: "high" }).data?.deadline).toBeNull();
  });
});
