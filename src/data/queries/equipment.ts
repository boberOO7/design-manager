import "server-only";
import { pcConfigurationSchema, type PcConfiguration } from "@/lib/pc-configuration";

import type { ActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import { getKyivDateOnly } from "@/lib/validation/project";
import type { FloorPlanPlacement } from "@/lib/office-floor-plan";
import type { Database } from "@/types/database.types";

type EquipmentRow = Database["public"]["Tables"]["equipment"]["Row"];
type EquipmentServiceEventRow = Database["public"]["Tables"]["equipment_service_events"]["Row"];
type WorkstationRow = Database["public"]["Tables"]["workstations"]["Row"];
type FloorPlanPlacementRow = Database["public"]["Tables"]["office_floor_plan_placements"]["Row"];

export type EquipmentMember = { id: string; fullName: string; avatarUrl: string | null };
export type EquipmentServiceEvent = {
  id: string;
  eventType: EquipmentServiceEventRow["event_type"];
  startedOn: string;
  completedOn: string | null;
  serviceProvider: string | null;
  costAmount: number | null;
  costCurrency: string | null;
  startedNotes: string | null;
  completionNotes: string | null;
};
export type EquipmentItem = Omit<EquipmentRow, "pc_configuration" | "studio_id" | "workstation_id" | "equipment_type" | "lifecycle_state" | "display_name" | "serial_number" | "asset_tag" | "recurring_maintenance_enabled" | "maintenance_interval_months" | "next_maintenance_due_date" | "maintenance_upcoming_notified_for" | "maintenance_overdue_notified_for" | "created_at" | "updated_at"> & {
  pcConfiguration: PcConfiguration | null;
  studioId: string;
  workstationId: string | null;
  equipmentType: EquipmentRow["equipment_type"];
  lifecycleState: EquipmentRow["lifecycle_state"];
  displayName: string | null;
  serialNumber: string | null;
  assetTag: string;
  recurringMaintenanceEnabled: boolean;
  maintenanceIntervalMonths: number | null;
  nextMaintenanceDueDate: string | null;
  serviceEvents: EquipmentServiceEvent[];
  createdAt: string;
  updatedAt: string;
};
export type WorkstationItem = {
  id: string;
  studioId: string;
  number: number;
  workstationType: WorkstationRow["workstation_type"];
  name: string | null;
  assignedEmployee: EquipmentMember | null;
  equipment: EquipmentItem[];
  createdAt: string;
  updatedAt: string;
};

type MemberRow = { user_id: string; profile: { full_name: string; avatar_url: string | null } };

function mapServiceEvent(row: EquipmentServiceEventRow): EquipmentServiceEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    startedOn: row.started_on,
    completedOn: row.completed_on,
    serviceProvider: row.service_provider,
    costAmount: row.cost_amount,
    costCurrency: row.cost_currency,
    startedNotes: row.started_notes,
    completionNotes: row.completion_notes,
  };
}

function mapEquipment(row: EquipmentRow, serviceEvents: EquipmentServiceEvent[]): EquipmentItem {
  return {
    id: row.id,
    studioId: row.studio_id,
    workstationId: row.workstation_id,
    equipmentType: row.equipment_type,
    lifecycleState: row.lifecycle_state,
    displayName: row.display_name,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serial_number,
    assetTag: row.asset_tag,
    recurringMaintenanceEnabled: row.recurring_maintenance_enabled,
    maintenanceIntervalMonths: row.maintenance_interval_months,
    nextMaintenanceDueDate: row.next_maintenance_due_date,
    serviceEvents,
    pcConfiguration: row.pc_configuration === null ? null : pcConfigurationSchema.parse(row.pc_configuration),
    cpu: row.cpu,
    gpu: row.gpu,
    ram: row.ram,
    storage: row.storage,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFloorPlanPlacement(row: FloorPlanPlacementRow): FloorPlanPlacement {
  const entityId = row.workstation_id ?? row.equipment_id;
  if (!entityId) throw new Error("Floor-plan placement is missing its entity.");
  return {
    id: row.id,
    entityType: row.workstation_id ? "workstation" : "equipment",
    entityId,
    floor: row.floor === 1 ? 1 : 2,
    x: row.x,
    y: row.y,
    displayMetadata: row.display_metadata,
  };
}

export async function getEquipmentData(admin: ActiveStudioMembership): Promise<{ members: EquipmentMember[]; workstations: WorkstationItem[]; equipment: EquipmentItem[]; floorPlanPlacements: FloorPlanPlacement[]; today: string }> {
  const supabase = await createClient();
  const [workstationsResult, equipmentResult, serviceEventsResult, membersResult, floorPlanResult] = await Promise.all([
    supabase.from("workstations").select("*").eq("studio_id", admin.studio_id).order("number"),
    supabase.from("equipment").select("*").eq("studio_id", admin.studio_id).order("display_name", { nullsFirst: false }).order("asset_tag"),
    supabase.from("equipment_service_events").select("*").eq("studio_id", admin.studio_id).order("completed_on", { ascending: false, nullsFirst: true }).order("started_on", { ascending: false }),
    supabase.from("studio_members").select("user_id, profile:profiles!studio_members_user_id_fkey!inner(full_name, avatar_url)").eq("studio_id", admin.studio_id).eq("is_active", true).eq("profile.is_active", true).overrideTypes<MemberRow[], { merge: false }>(),
    supabase.from("office_floor_plan_placements").select("*").eq("studio_id", admin.studio_id).order("created_at"),
  ]);
  const failure = workstationsResult.error ?? equipmentResult.error ?? serviceEventsResult.error ?? membersResult.error ?? floorPlanResult.error;
  if (failure) throw new Error("Unable to load equipment inventory.", { cause: failure });

  const members = (membersResult.data ?? []).map((row) => ({ id: row.user_id, fullName: row.profile.full_name, avatarUrl: row.profile.avatar_url })).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const memberById = new Map(members.map((member) => [member.id, member]));
  const eventsByEquipment = new Map<string, EquipmentServiceEvent[]>();
  for (const row of serviceEventsResult.data ?? []) {
    const events = eventsByEquipment.get(row.equipment_id) ?? [];
    events.push(mapServiceEvent(row));
    eventsByEquipment.set(row.equipment_id, events);
  }
  const equipment = (equipmentResult.data ?? []).map((row) => mapEquipment(row, eventsByEquipment.get(row.id) ?? []));
  const equipmentByWorkstation = new Map<string, EquipmentItem[]>();
  for (const item of equipment) {
    if (!item.workstationId) continue;
    const current = equipmentByWorkstation.get(item.workstationId) ?? [];
    current.push(item);
    equipmentByWorkstation.set(item.workstationId, current);
  }

  return {
    members,
    equipment,
    floorPlanPlacements: (floorPlanResult.data ?? []).map(mapFloorPlanPlacement),
    today: getKyivDateOnly(),
    workstations: (workstationsResult.data ?? []).map((row: WorkstationRow) => ({
      id: row.id,
      studioId: row.studio_id,
      number: row.number,
      workstationType: row.workstation_type,
      name: row.name,
      assignedEmployee: row.assigned_employee_id ? memberById.get(row.assigned_employee_id) ?? null : null,
      equipment: equipmentByWorkstation.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}
