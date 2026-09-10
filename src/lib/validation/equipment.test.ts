import { describe, expect, it } from "vitest";
import { equipmentAssignmentSchema, equipmentInputSchema, workstationInputSchema } from "./equipment";

const baseEquipment = {
  equipmentType: "printer",
  lifecycleState: "active",
  displayName: "Office printer",
  workstationId: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  assetTag: "",
  cpu: "",
  gpu: "",
  ram: "",
  storage: "",
  notes: "",
};

describe("equipment validation", () => {
  it("normalizes optional workstation and inventory metadata values", () => {
    const parsed = equipmentInputSchema.parse(baseEquipment);
    expect(parsed.workstationId).toBeNull();
    expect(parsed.manufacturer).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("accepts optional structured specifications for PCs and laptops", () => {
    expect(equipmentInputSchema.safeParse({ ...baseEquipment, equipmentType: "pc", cpu: "Ryzen 9", gpu: "RTX 5090", ram: "128 GB", storage: "4 TB NVMe" }).success).toBe(true);
    expect(equipmentInputSchema.safeParse({ ...baseEquipment, equipmentType: "laptop", cpu: "M4 Max" }).success).toBe(true);
  });

  it("rejects computer specifications for unrelated equipment types", () => {
    const parsed = equipmentInputSchema.safeParse({ ...baseEquipment, equipmentType: "monitor", cpu: "Not applicable" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toEqual(["cpu"]);
  });

  it("supports employee assignment and explicit unassignment", () => {
    expect(workstationInputSchema.parse({ name: " Desk 04 ", assignedEmployeeId: "__none" })).toEqual({ name: "Desk 04", assignedEmployeeId: null });
    expect(workstationInputSchema.safeParse({ name: "", assignedEmployeeId: null }).success).toBe(false);
  });

  it("supports attaching, moving, and detaching one equipment identity", () => {
    const equipmentId = "47000000-0000-4000-8000-000000000201";
    const workstationId = "47000000-0000-4000-8000-000000000101";
    expect(equipmentAssignmentSchema.parse({ equipmentId, workstationId })).toEqual({ equipmentId, workstationId });
    expect(equipmentAssignmentSchema.parse({ equipmentId, workstationId: "" })).toEqual({ equipmentId, workstationId: null });
  });
});
