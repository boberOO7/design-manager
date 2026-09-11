import { describe, expect, it } from "vitest";
import { completeEquipmentServiceSchema, equipmentAssignmentSchema, equipmentInputSchema, recordEquipmentHistorySchema, startEquipmentServiceSchema, workstationInputSchema } from "./equipment";

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

  it("requires an interval and explicit due date only when recurrence is enabled", () => {
    expect(equipmentInputSchema.safeParse({ ...baseEquipment, recurringMaintenanceEnabled: true }).success).toBe(false);
    expect(equipmentInputSchema.safeParse({ ...baseEquipment, recurringMaintenanceEnabled: true, maintenanceIntervalMonths: "6", nextMaintenanceDueDate: "2026-10-01" }).success).toBe(true);
    expect(equipmentInputSchema.parse({ ...baseEquipment, recurringMaintenanceEnabled: false, maintenanceIntervalMonths: "", nextMaintenanceDueDate: "" })).toMatchObject({ maintenanceIntervalMonths: null, nextMaintenanceDueDate: null });
  });

  it("validates service completion, cost pairs, and direct history event types", () => {
    const equipmentId = "47000000-0000-4000-8000-000000000201";
    expect(startEquipmentServiceSchema.safeParse({ equipmentId, eventType: "regular_maintenance", startedOn: "2026-09-11", serviceProvider: "", notes: "" }).success).toBe(true);
    expect(completeEquipmentServiceSchema.safeParse({ serviceEventId: equipmentId, completedOn: "2026-09-12", returnState: "retired", costAmount: "", costCurrency: "", notes: "" }).success).toBe(false);
    expect(completeEquipmentServiceSchema.safeParse({ serviceEventId: equipmentId, completedOn: "2026-09-12", returnState: "active", costAmount: "100", costCurrency: "", notes: "" }).success).toBe(false);
    expect(recordEquipmentHistorySchema.safeParse({ equipmentId, eventType: "regular_maintenance", startedOn: "", completedOn: "2026-09-12", serviceProvider: "", costAmount: "", costCurrency: "", notes: "" }).success).toBe(false);
    expect(recordEquipmentHistorySchema.safeParse({ equipmentId, eventType: "upgrade", startedOn: "2026-09-13", completedOn: "2026-09-12", serviceProvider: "", costAmount: "", costCurrency: "", notes: "" }).success).toBe(false);
  });
});
