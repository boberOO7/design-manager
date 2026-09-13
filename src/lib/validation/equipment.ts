import { z } from "zod";
import { pcConfigurationSchema, parsePcConfigurationFormValue } from "@/lib/pc-configuration";
import { CRM_BUDGET_CURRENCIES } from "@/lib/crm-budget";
import { EQUIPMENT_LIFECYCLE_STATES, EQUIPMENT_SERVICE_EVENT_TYPES, EQUIPMENT_TYPES, isComputerEquipment } from "@/lib/equipment";

const nullableUuid = z.union([z.string().uuid(), z.literal(""), z.literal("__none"), z.null()]).transform((value) => value === "" || value === "__none" ? null : value);
const optionalText = (max: number) => z.union([z.string().trim().min(1).max(max), z.literal(""), z.null()]).transform((value) => value || null);
const optionalDate = z.union([z.iso.date(), z.literal(""), z.null()]).transform((value) => value || null);
const optionalCost = z.union([z.coerce.number().positive().max(9_999_999_999.99), z.literal(""), z.null()]).transform((value) => value === "" ? null : value);

export const workstationInputSchema = z.object({
  number: z.coerce.number().int().min(1).max(1_000_000),
  workstationType: z.enum(["office", "remote"]).default("office"),
  name: optionalText(120),
  assignedEmployeeId: nullableUuid,
});

export const workstationUpdateSchema = workstationInputSchema.extend({ workstationId: z.string().uuid() });
export const workstationDeleteSchema = z.object({ workstationId: z.string().uuid() });
export const workstationBulkCreateSchema = z.object({
  workstations: z.array(workstationInputSchema).min(1).max(50),
}).superRefine((value, context) => {
  const numbers = new Set<number>();
  const employees = new Set<string>();
  value.workstations.forEach((workstation, index) => {
    if (numbers.has(workstation.number)) context.addIssue({ code: "custom", path: ["workstations", index, "number"], message: "duplicate_number" });
    numbers.add(workstation.number);
    if (workstation.assignedEmployeeId && employees.has(workstation.assignedEmployeeId)) context.addIssue({ code: "custom", path: ["workstations", index, "assignedEmployeeId"], message: "duplicate_employee" });
    if (workstation.assignedEmployeeId) employees.add(workstation.assignedEmployeeId);
  });
});

export const equipmentInputSchema = z.object({
  equipmentType: z.enum(EQUIPMENT_TYPES),
  lifecycleState: z.enum(EQUIPMENT_LIFECYCLE_STATES),
  displayName: optionalText(160),
  workstationId: nullableUuid,
  manufacturer: optionalText(160),
  model: optionalText(160),
  serialNumber: optionalText(160),
  assetTag: optionalText(160),
  pcConfiguration: z.preprocess(parsePcConfigurationFormValue, pcConfigurationSchema.nullable().optional()),
  cpu: optionalText(500),
  gpu: optionalText(500),
  ram: optionalText(500),
  storage: optionalText(500),
  notes: optionalText(5000),
  recurringMaintenanceEnabled: z.boolean().optional().default(false),
  maintenanceIntervalMonths: z.preprocess((value) => value ?? null, z.union([z.coerce.number().int().min(1).max(120), z.literal(""), z.null()]).transform((value) => value === "" ? null : value)),
  nextMaintenanceDueDate: z.preprocess((value) => value ?? null, optionalDate),
}).superRefine((value, context) => {
  if (value.pcConfiguration && value.equipmentType !== "pc") context.addIssue({ code: "custom", path: ["pcConfiguration"], message: "pc_configuration" });
  if (!isComputerEquipment(value.equipmentType)) {
    for (const field of ["cpu", "gpu", "ram", "storage"] as const) {
      if (value[field] !== null) context.addIssue({ code: "custom", path: [field], message: "computer_specification" });
    }
  }
  if (!value.recurringMaintenanceEnabled) return;
  if (!value.maintenanceIntervalMonths) context.addIssue({ code: "custom", path: ["maintenanceIntervalMonths"], message: "maintenance_interval_required" });
  if (!value.nextMaintenanceDueDate) context.addIssue({ code: "custom", path: ["nextMaintenanceDueDate"], message: "maintenance_date_required" });
});

export const equipmentUpdateSchema = equipmentInputSchema.and(z.object({ equipmentId: z.string().uuid() }));
// Single-field writes cannot overwrite a concurrent service transition or schedule.
export const equipmentFieldUpdateSchema = z.discriminatedUnion("field", [
  z.object({ equipmentId: z.uuid(), field: z.literal("displayName"), value: optionalText(160) }),
  z.object({ equipmentId: z.uuid(), field: z.literal("lifecycleState"), value: z.enum(["active", "spare", "retired"]) }),
  z.object({ equipmentId: z.uuid(), field: z.literal("workstationId"), value: nullableUuid }),
  z.object({ equipmentId: z.uuid(), field: z.literal("assetTag"), value: z.string().trim().min(1).max(160) }),
  z.object({ equipmentId: z.uuid(), field: z.literal("manufacturer"), value: optionalText(160) }),
  z.object({ equipmentId: z.uuid(), field: z.literal("model"), value: optionalText(160) }),
  z.object({ equipmentId: z.uuid(), field: z.literal("serialNumber"), value: optionalText(160) }),
  z.object({ equipmentId: z.uuid(), field: z.literal("notes"), value: optionalText(5000) }),
  ...(["cpu", "gpu", "ram", "storage"] as const).map((field) => z.object({ equipmentId: z.uuid(), field: z.literal(field), value: optionalText(500) })),
  z.object({ equipmentId: z.uuid(), field: z.literal("pcConfiguration"), value: pcConfigurationSchema.nullable() }),
]);
export type EquipmentFieldUpdate = z.infer<typeof equipmentFieldUpdateSchema>;
export const equipmentMaintenanceSchema = z.object({
  equipmentId: z.uuid(),
  enabled: z.boolean(),
  interval: z.coerce.number().int().min(1).max(120).nullable(),
  dueDate: z.iso.date().nullable(),
}).refine((value) => !value.enabled || (value.interval !== null && value.dueDate !== null));

export const equipmentDeleteSchema = z.object({ equipmentId: z.string().uuid() });
export const equipmentAssignmentSchema = z.object({ equipmentId: z.string().uuid(), workstationId: nullableUuid });
const floorPlanDisplayMetadataSchema = z.object({
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  width: z.number().min(6).max(120).optional(),
  height: z.number().min(6).max(120).optional(),
}).catchall(z.json()).refine((metadata) => (metadata.width === undefined) === (metadata.height === undefined));
export const floorPlanLayoutSchema = z.object({
  placements: z.array(z.object({
    entityType: z.enum(["workstation", "equipment"]),
    entityId: z.uuid(),
    floor: z.union([z.literal(1), z.literal(2)]),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    displayMetadata: floorPlanDisplayMetadataSchema.default({}),
  })).max(1000),
}).superRefine((value, context) => {
  const entities = new Set<string>();
  value.placements.forEach((placement, index) => {
    const key = `${placement.entityType}:${placement.entityId}`;
    if (entities.has(key)) context.addIssue({ code: "custom", path: ["placements", index], message: "duplicate_entity" });
    entities.add(key);
  });
});

const serviceDetails = {
  serviceProvider: optionalText(160),
  notes: optionalText(5000),
};

export const startEquipmentServiceSchema = z.object({
  equipmentId: z.string().uuid(),
  eventType: z.enum(EQUIPMENT_SERVICE_EVENT_TYPES),
  startedOn: z.iso.date(),
  ...serviceDetails,
});

export const completeEquipmentServiceSchema = z.object({
  serviceEventId: z.string().uuid(),
  completedOn: z.iso.date(),
  returnState: z.enum(["active", "spare"]),
  costAmount: optionalCost,
  costCurrency: z.union([z.enum(CRM_BUDGET_CURRENCIES), z.literal(""), z.null()]).transform((value) => value || null),
  notes: optionalText(5000),
}).superRefine((value, context) => {
  if ((value.costAmount === null) !== (value.costCurrency === null)) context.addIssue({ code: "custom", path: ["costAmount"], message: "cost_pair_required" });
});

export const recordEquipmentHistorySchema = z.object({
  equipmentId: z.string().uuid(),
  eventType: z.enum(["repair", "upgrade"]),
  startedOn: optionalDate,
  completedOn: z.iso.date(),
  serviceProvider: optionalText(160),
  costAmount: optionalCost,
  costCurrency: z.union([z.enum(CRM_BUDGET_CURRENCIES), z.literal(""), z.null()]).transform((value) => value || null),
  notes: optionalText(5000),
}).superRefine((value, context) => {
  if (value.startedOn && value.startedOn > value.completedOn) context.addIssue({ code: "custom", path: ["completedOn"], message: "invalid_date_order" });
  if ((value.costAmount === null) !== (value.costCurrency === null)) context.addIssue({ code: "custom", path: ["costAmount"], message: "cost_pair_required" });
});

export type WorkstationInput = z.infer<typeof workstationInputSchema>;
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;
export type EquipmentActionState = {
  success?: true;
  id?: string;
  error?: "permission" | "invalid" | "duplicate" | "member" | "location" | "notFound" | "create" | "update" | "delete" | "assign" | "service" | "completeService" | "history" | "serviceState" | "numberConflict" | "employeeAssigned" | "batch" | "layout";
};
