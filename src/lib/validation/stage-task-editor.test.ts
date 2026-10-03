import { describe, expect, it } from "vitest";
import { stageTaskEditSchema } from "./task";

const id = "123e4567-e89b-12d3-a456-426614174000";
const newId = "123e4567-e89b-12d3-a456-426614174001";
const structure = { title: " Room ", completed_area_m2: "12.5", checklist_template_id: null };
const batch = {
  stage: "stage_2",
  updates: [{ ...structure, id, previous: { ...structure, completed_area_m2: null } }],
  creates: [{ ...structure, client_key: newId, source_task_id: id }],
  delete_ids: [],
  order: [id, newId],
};

describe("stage structural batch", () => {
  it("normalizes area and title without admitting operational fields", () => {
    expect(stageTaskEditSchema.parse(batch).creates[0]).toEqual({
      title: "Room", completed_area_m2: 12.5, checklist_template_id: null, client_key: newId, source_task_id: id,
    });
    for (const field of ["status", "assignee_id", "production_completion", "deadlines", "progress_weight"]) {
      expect(stageTaskEditSchema.safeParse({ ...batch, creates: [{ ...batch.creates[0], [field]: "copied" }] }).success).toBe(false);
    }
    expect(stageTaskEditSchema.safeParse({ ...batch, creates: [{ ...batch.creates[0], completed_area_m2: -1 }] }).success).toBe(false);
  });

  it("rejects overlapping updates/deletes and accepts blank areas", () => {
    expect(stageTaskEditSchema.safeParse({ ...batch, delete_ids: [id] }).success).toBe(false);
    expect(stageTaskEditSchema.safeParse({ ...batch, order: [id, id] }).success).toBe(false);
    expect(stageTaskEditSchema.safeParse({ ...batch, order: [id] }).success).toBe(false);
    expect(stageTaskEditSchema.parse({ ...batch, creates: [{ ...batch.creates[0], completed_area_m2: "" }] }).creates[0].completed_area_m2).toBeNull();
  });
});
