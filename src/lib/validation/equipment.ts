import { z } from "zod";
import { EQUIPMENT_LIFECYCLE_STATES, EQUIPMENT_TYPES, isComputerEquipment } from "@/lib/equipment";

const nullableUuid = z.union([z.string().uuid(), z.literal(""), z.literal("__none"), z.null()]).transform((value) => value === "" || value === "__none" ? null : value);
const optionalText = (max: number) => z.union([z.string().trim().min(1).max(max), z.literal(""), z.null()]).transform((value) => value || null);

export const workstationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  assignedEmployeeId: nullableUuid,
});

export const workstationUpdateSchema = workstationInputSchema.extend({ workstationId: z.string().uuid() });
export const workstationDeleteSchema = z.object({ workstationId: z.string().uuid() });

export const equipmentInputSchema = z.object({
  equipmentType: z.enum(EQUIPMENT_TYPES),
  lifecycleState: z.enum(EQUIPMENT_LIFECYCLE_STATES),
  displayName: z.string().trim().min(1).max(160),
  workstationId: nullableUuid,
  manufacturer: optionalText(160),
  model: optionalText(160),
  serialNumber: optionalText(160),
  assetTag: optionalText(160),
  cpu: optionalText(500),
  gpu: optionalText(500),
  ram: optionalText(500),
  storage: optionalText(500),
  notes: optionalText(5000),
}).superRefine((value, context) => {
  if (isComputerEquipment(value.equipmentType)) return;
  for (const field of ["cpu", "gpu", "ram", "storage"] as const) {
    if (value[field] !== null) context.addIssue({ code: "custom", path: [field], message: "computer_specification" });
  }
});

export const equipmentUpdateSchema = equipmentInputSchema.and(z.object({ equipmentId: z.string().uuid() }));
export const equipmentDeleteSchema = z.object({ equipmentId: z.string().uuid() });
export const equipmentAssignmentSchema = z.object({ equipmentId: z.string().uuid(), workstationId: nullableUuid });

export type WorkstationInput = z.infer<typeof workstationInputSchema>;
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;
export type EquipmentActionState = {
  success?: true;
  id?: string;
  error?: "permission" | "invalid" | "duplicate" | "member" | "location" | "notFound" | "create" | "update" | "delete" | "assign";
};
