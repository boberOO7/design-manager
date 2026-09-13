import { describe, expect, it } from "vitest";
import { EMPTY_COMPUTER_CONFIGURATION } from "@/lib/pc-configuration";
import { equipmentDisplayName, equipmentInventoryNumber, equipmentInventoryPrefix } from "@/lib/equipment";
import { equipmentFieldUpdateSchema, equipmentMaintenanceSchema, completeEquipmentServiceSchema, equipmentAssignmentSchema, equipmentInputSchema, floorPlanLayoutSchema, recordEquipmentHistorySchema, startEquipmentServiceSchema, workstationBulkCreateSchema, workstationInputSchema } from "./equipment";

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
    expect(equipmentInputSchema.parse({ ...baseEquipment, displayName: "" }).displayName).toBeNull();
    expect(equipmentDisplayName({ equipmentType: "pc", displayName: null, assetTag: "PC-01", manufacturer: null, model: null })).toBe("PC-01");
    expect(equipmentDisplayName({ equipmentType: "headphones", displayName: null, assetTag: null, manufacturer: null, model: null })).toBe("headphones");
    expect(equipmentInventoryPrefix("air_conditioner")).toBe("AC-");
    expect(equipmentInventoryNumber("PC-002", "pc")).toBe("002");
    expect(equipmentInventoryNumber("CUSTOM", "pc")).toBe("");
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

  it("accepts structured PC form JSON, preserves text, and rejects other categories or malformed JSON", () => {
    const pcConfiguration = { ...EMPTY_COMPUTER_CONFIGURATION, graphics: { mode: "integrated" }, drives: [{ type: "hdd", capacity: 2, unit: "TB" }] };
    const input = { ...baseEquipment, equipmentType: "pc", displayName: "", cpu: "unparsed CPU", storage: "unparsed disks", pcConfiguration: JSON.stringify(pcConfiguration) };
    expect(equipmentInputSchema.parse(input)).toMatchObject({ displayName: null, cpu: "unparsed CPU", storage: "unparsed disks", pcConfiguration });
    expect(equipmentInputSchema.safeParse({ ...input, equipmentType: "laptop" }).success).toBe(true);
    expect(equipmentInputSchema.safeParse({ ...input, equipmentType: "laptop", pcConfiguration: JSON.stringify({ ...pcConfiguration, motherboard: { manufacturer: "ASUS", model: null, chipset: null } }) }).success).toBe(false);
    expect(equipmentInputSchema.safeParse({ ...input, pcConfiguration: "{invalid" }).success).toBe(false);
    expect(equipmentInputSchema.parse({ ...input, pcConfiguration: undefined }).pcConfiguration).toBeUndefined();
  });

  it("requires a workstation number while keeping its name and employee optional", () => {
    expect(workstationInputSchema.parse({ number: "4", name: " Desk 04 ", assignedEmployeeId: "__none" })).toEqual({ number: 4, workstationType: "office", name: "Desk 04", assignedEmployeeId: null });
    expect(workstationInputSchema.safeParse({ number: 0, name: "", assignedEmployeeId: null }).success).toBe(false);
  });

  it("rejects duplicate numbers and employees in one atomic workstation batch", () => {
    const employeeId = "47000000-0000-4000-8000-000000000101";
    expect(workstationBulkCreateSchema.safeParse({ workstations: [{ number: 7, name: "", assignedEmployeeId: employeeId }, { number: 7, name: "Window desk", assignedEmployeeId: "__none" }] }).success).toBe(false);
    expect(workstationBulkCreateSchema.safeParse({ workstations: [{ number: 7, name: "", assignedEmployeeId: employeeId }, { number: 8, name: "", assignedEmployeeId: employeeId }] }).success).toBe(false);
  });

  it("supports attaching, moving, and detaching one equipment identity", () => {
    const equipmentId = "47000000-0000-4000-8000-000000000201";
    const workstationId = "47000000-0000-4000-8000-000000000101";
    expect(equipmentAssignmentSchema.parse({ equipmentId, workstationId })).toEqual({ equipmentId, workstationId });
    expect(equipmentAssignmentSchema.parse({ equipmentId, workstationId: "" })).toEqual({ equipmentId, workstationId: null });
  });

  it("accepts only bounded quarter-turn floor-plan appearance metadata", () => {
    const placement = { entityType: "workstation", entityId: "47000000-0000-4000-8000-000000000101", floor: 1, x: 0.5, y: 0.5 };
    expect(floorPlanLayoutSchema.safeParse({ placements: [{ ...placement, displayMetadata: { rotation: 90, width: 34, height: 15, future: "kept" } }] }).success).toBe(true);
    expect(floorPlanLayoutSchema.safeParse({ placements: [{ ...placement, displayMetadata: { rotation: 45 } }] }).success).toBe(false);
    expect(floorPlanLayoutSchema.safeParse({ placements: [{ ...placement, displayMetadata: { width: 34 } }] }).success).toBe(false);
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
  it("validates isolated field writes and atomic schedules without accepting identity or service overrides", () => {
    const equipmentId = "59000000-0000-4000-8000-000000000201";
    expect(equipmentFieldUpdateSchema.parse({ equipmentId, field: "assetTag", value: " PC-99 " }).value).toBe("PC-99");
    expect(equipmentFieldUpdateSchema.parse({ equipmentId, field: "displayName", value: "" }).value).toBeNull();
    expect(equipmentFieldUpdateSchema.safeParse({ equipmentId, field: "equipmentType", value: "monitor" }).success).toBe(false);
    expect(equipmentFieldUpdateSchema.safeParse({ equipmentId, field: "assetTag", value: "" }).success).toBe(false);
    expect(equipmentFieldUpdateSchema.safeParse({ equipmentId, field: "studioId", value: equipmentId }).success).toBe(false);
    expect(equipmentFieldUpdateSchema.safeParse({ equipmentId, field: "lifecycleState", value: "in_service" }).success).toBe(false);
    expect(equipmentFieldUpdateSchema.safeParse({ equipmentId, field: "pcConfiguration", value: { ...EMPTY_COMPUTER_CONFIGURATION, drives: [{ type: "ssd", capacity: 0, unit: "TB" }] } }).success).toBe(false);
    expect(equipmentMaintenanceSchema.safeParse({ equipmentId, enabled: true, interval: 6, dueDate: null }).success).toBe(false);
    expect(equipmentMaintenanceSchema.safeParse({ equipmentId, enabled: false, interval: null, dueDate: null }).success).toBe(true);
    expect(workstationInputSchema.parse({ number: 8, workstationType: "remote", name: "", assignedEmployeeId: null }).workstationType).toBe("remote");
    expect(workstationInputSchema.safeParse({ number: 8, workstationType: "unknown", name: "", assignedEmployeeId: null }).success).toBe(false);
    expect(equipmentInputSchema.parse({ ...baseEquipment, model: "Unknown custom model" }).model).toBe("Unknown custom model");
  });

});
