"use server";

import type { Database } from "@/types/database.types";
import { revalidatePath } from "next/cache";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import {
  equipmentAssignmentSchema,
  equipmentFieldUpdateSchema,
  equipmentMaintenanceSchema,
  equipmentDeleteSchema,
  equipmentInputSchema,
  floorPlanLayoutSchema,
  equipmentUpdateSchema,
  completeEquipmentServiceSchema,
  recordEquipmentHistorySchema,
  startEquipmentServiceSchema,
  workstationDeleteSchema,
  workstationBulkCreateSchema,
  workstationUpdateSchema,
  type EquipmentActionState,
  type EquipmentInput,
} from "@/lib/validation/equipment";

function refreshEquipment() {
  revalidatePath("/office");
  revalidatePath("/office/equipment");
}

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function workstationValues(formData: FormData) {
  return { number: formValue(formData, "number"), workstationType: formValue(formData, "workstationType") || "office", name: formValue(formData, "name"), assignedEmployeeId: formValue(formData, "assignedEmployeeId") };
}

function equipmentValues(formData: FormData) {
  return {
    equipmentType: formValue(formData, "equipmentType"), lifecycleState: formValue(formData, "lifecycleState"),
    displayName: formValue(formData, "displayName"), workstationId: formValue(formData, "workstationId"),
    manufacturer: formValue(formData, "manufacturer"), model: formValue(formData, "model"),
    serialNumber: formValue(formData, "serialNumber"), assetTag: formValue(formData, "assetTag"),
    pcConfiguration: formValue(formData, "pcConfiguration"),
    cpu: formValue(formData, "cpu"), gpu: formValue(formData, "gpu"), ram: formValue(formData, "ram"),
    storage: formValue(formData, "storage"), notes: formValue(formData, "notes"),
    recurringMaintenanceEnabled: formData.get("recurringMaintenanceEnabled") === "on",
    maintenanceIntervalMonths: formValue(formData, "maintenanceIntervalMonths"),
    nextMaintenanceDueDate: formValue(formData, "nextMaintenanceDueDate"),
  };
}

function equipmentPayload(input: EquipmentInput) {
  return {
    equipment_type: input.equipmentType,
    lifecycle_state: input.lifecycleState,
    display_name: input.displayName,
    workstation_id: input.workstationId,
    manufacturer: input.manufacturer,
    model: input.model,
    serial_number: input.serialNumber,
    ...(input.assetTag ? { asset_tag: input.assetTag } : {}),
    ...(input.pcConfiguration !== undefined ? { pc_configuration: input.pcConfiguration } : {}),
    cpu: input.cpu,
    gpu: input.gpu,
    ram: input.ram,
    storage: input.storage,
    notes: input.notes,
    recurring_maintenance_enabled: input.recurringMaintenanceEnabled,
    maintenance_interval_months: input.recurringMaintenanceEnabled ? input.maintenanceIntervalMonths : null,
    next_maintenance_due_date: input.recurringMaintenanceEnabled ? input.nextMaintenanceDueDate : null,
  };
}

function databaseError(error: { code?: string; message: string } | null, fallback: NonNullable<EquipmentActionState["error"]>): EquipmentActionState["error"] {
  if (!error) return fallback;
  if (error.message.includes("workstation_number_conflict") || error.message.includes("duplicate_workstation_number") || error.message.includes("workstations_studio_number_unique_idx")) return "numberConflict";
  if (error.message.includes("workstation_employee_unavailable") || error.message.includes("duplicate_workstation_employee") || error.message.includes("workstations_studio_assigned_employee_unique_idx")) return "employeeAssigned";
  if (error.message.includes("workstation_create")) return "batch";
  if (error.code === "23505") return "duplicate";
  if (error.code === "23503") return "location";
  if (error.code === "23514") return "invalid";
  if (error.code === "42501") return "permission";
  if (error.message.includes("assigned_employee_must_be_an_active_studio_member")) return "member";
  if (error.message.includes("service") || error.message.includes("history")) return "serviceState";
  return fallback;
}

export async function createWorkstation(_state: EquipmentActionState, formData: FormData): Promise<EquipmentActionState> {
  return createWorkstations({ workstations: [workstationValues(formData)] });
}

export async function createWorkstations(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = workstationBulkCreateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workstations", {
    p_studio_id: admin.studio_id,
    p_workstations: parsed.data.workstations.map((workstation) => ({ number: workstation.number, name: workstation.name, assigned_employee_id: workstation.assignedEmployeeId, workstation_type: workstation.workstationType })),
  });
  if (error || !data?.length) return { error: databaseError(error, "create") };
  refreshEquipment();
  return { success: true, id: data[0] };
}

export async function updateWorkstation(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = workstationUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("workstations").update({ number: parsed.data.number, name: parsed.data.name, assigned_employee_id: parsed.data.assignedEmployeeId, workstation_type: parsed.data.workstationType }).eq("id", parsed.data.workstationId).eq("studio_id", admin.studio_id).select("id").maybeSingle();
  if (error) return { error: databaseError(error, "update") };
  if (!data) return { error: "notFound" };
  refreshEquipment();
  return { success: true, id: data.id };
}

export async function deleteWorkstation(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = workstationDeleteSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("workstations").delete().eq("id", parsed.data.workstationId).eq("studio_id", admin.studio_id).select("id").maybeSingle();
  if (error) return { error: databaseError(error, "delete") };
  if (!data) return { error: "notFound" };
  refreshEquipment();
  return { success: true };
}

export async function createEquipment(_state: EquipmentActionState, formData: FormData): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = equipmentInputSchema.safeParse(equipmentValues(formData));
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment").insert({ studio_id: admin.studio_id, ...equipmentPayload(parsed.data) }).select("id").single();
  if (error || !data) return { error: databaseError(error, "create") };
  refreshEquipment();
  return { success: true, id: data.id };
}

export async function updateEquipment(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = equipmentUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment").update(equipmentPayload(parsed.data)).eq("id", parsed.data.equipmentId).eq("studio_id", admin.studio_id).select("id").maybeSingle();
  if (error) return { error: databaseError(error, "update") };
  if (!data) return { error: "notFound" };
  refreshEquipment();
  return { success: true, id: data.id };
}

export async function updateEquipmentField(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = equipmentFieldUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { equipmentId, field, value } = parsed.data;
  const columns = { displayName: "display_name", lifecycleState: "lifecycle_state", workstationId: "workstation_id", assetTag: "asset_tag", manufacturer: "manufacturer", model: "model", serialNumber: "serial_number", notes: "notes", cpu: "cpu", gpu: "gpu", ram: "ram", storage: "storage", pcConfiguration: "pc_configuration" } as const;
  const payload: Database["public"]["Tables"]["equipment"]["Update"] = { [columns[field]]: value };
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment").update(payload).eq("id", equipmentId).eq("studio_id", admin.studio_id).select("id").maybeSingle();
  if (error) return { error: databaseError(error, "update") };
  if (!data) return { error: "notFound" };
  refreshEquipment();
  return { success: true, id: data.id };
}

export async function updateEquipmentMaintenance(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = equipmentMaintenanceSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { equipmentId, enabled, interval, dueDate } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment").update({ recurring_maintenance_enabled: enabled, maintenance_interval_months: enabled ? interval : null, next_maintenance_due_date: enabled ? dueDate : null }).eq("id", equipmentId).eq("studio_id", admin.studio_id).select("id").maybeSingle();
  if (error) return { error: databaseError(error, "update") };
  if (!data) return { error: "notFound" };
  refreshEquipment();
  return { success: true, id: data.id };
}

export async function assignEquipment(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = equipmentAssignmentSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment").update({ workstation_id: parsed.data.workstationId }).eq("id", parsed.data.equipmentId).eq("studio_id", admin.studio_id).select("id").maybeSingle();
  if (error) return { error: databaseError(error, "assign") };
  if (!data) return { error: "notFound" };
  refreshEquipment();
  return { success: true, id: data.id };
}

export async function saveFloorPlanLayout(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = floorPlanLayoutSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_office_floor_plan_layout", {
    p_studio_id: admin.studio_id,
    p_placements: parsed.data.placements.map((placement) => ({
      entity_type: placement.entityType,
      entity_id: placement.entityId,
      floor: placement.floor,
      x: placement.x,
      y: placement.y,
      display_metadata: placement.displayMetadata,
    })),
  });
  if (error) return { error: databaseError(error, "layout") };
  refreshEquipment();
  return { success: true };
}

export async function deleteEquipment(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = equipmentDeleteSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment").delete().eq("id", parsed.data.equipmentId).eq("studio_id", admin.studio_id).select("id").maybeSingle();
  if (error) return { error: databaseError(error, "delete") };
  if (!data) return { error: "notFound" };
  refreshEquipment();
  return { success: true };
}

export async function startEquipmentService(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = startEquipmentServiceSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_equipment_service", {
    p_equipment_id: parsed.data.equipmentId,
    p_event_type: parsed.data.eventType,
    p_started_on: parsed.data.startedOn,
    p_service_provider: parsed.data.serviceProvider ?? undefined,
    p_notes: parsed.data.notes ?? undefined,
  });
  if (error || !data) return { error: databaseError(error, "service") };
  refreshEquipment();
  return { success: true, id: data };
}

export async function completeEquipmentService(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = completeEquipmentServiceSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_equipment_service", {
    p_service_event_id: parsed.data.serviceEventId,
    p_completed_on: parsed.data.completedOn,
    p_return_state: parsed.data.returnState,
    p_cost_amount: parsed.data.costAmount ?? undefined,
    p_cost_currency: parsed.data.costCurrency ?? undefined,
    p_notes: parsed.data.notes ?? undefined,
  });
  if (error || !data) return { error: databaseError(error, "completeService") };
  refreshEquipment();
  return { success: true, id: data };
}

export async function recordEquipmentHistory(input: unknown): Promise<EquipmentActionState> {
  const admin = await getActiveStudioAdmin();
  if (!admin) return { error: "permission" };
  const parsed = recordEquipmentHistorySchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_equipment_history_event", {
    p_equipment_id: parsed.data.equipmentId,
    p_event_type: parsed.data.eventType,
    p_started_on: parsed.data.startedOn ?? undefined,
    p_completed_on: parsed.data.completedOn,
    p_service_provider: parsed.data.serviceProvider ?? undefined,
    p_cost_amount: parsed.data.costAmount ?? undefined,
    p_cost_currency: parsed.data.costCurrency ?? undefined,
    p_notes: parsed.data.notes ?? undefined,
  });
  if (error || !data) return { error: databaseError(error, "history") };
  refreshEquipment();
  return { success: true, id: data };
}
