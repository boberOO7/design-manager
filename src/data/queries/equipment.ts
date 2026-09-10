import "server-only";

import type { ActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type EquipmentRow = Database["public"]["Tables"]["equipment"]["Row"];
type WorkstationRow = Database["public"]["Tables"]["workstations"]["Row"];

export type EquipmentMember = { id: string; fullName: string; avatarUrl: string | null };
export type EquipmentItem = Omit<EquipmentRow, "studio_id" | "workstation_id" | "equipment_type" | "lifecycle_state" | "display_name" | "serial_number" | "asset_tag" | "created_at" | "updated_at"> & {
  studioId: string;
  workstationId: string | null;
  equipmentType: EquipmentRow["equipment_type"];
  lifecycleState: EquipmentRow["lifecycle_state"];
  displayName: string;
  serialNumber: string | null;
  assetTag: string | null;
  createdAt: string;
  updatedAt: string;
};
export type WorkstationItem = {
  id: string;
  studioId: string;
  name: string;
  assignedEmployee: EquipmentMember | null;
  equipment: EquipmentItem[];
  createdAt: string;
  updatedAt: string;
};

type MemberRow = { user_id: string; profile: { full_name: string; avatar_url: string | null } };

function mapEquipment(row: EquipmentRow): EquipmentItem {
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
    cpu: row.cpu,
    gpu: row.gpu,
    ram: row.ram,
    storage: row.storage,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getEquipmentData(admin: ActiveStudioMembership): Promise<{ members: EquipmentMember[]; workstations: WorkstationItem[]; equipment: EquipmentItem[] }> {
  const supabase = await createClient();
  const [workstationsResult, equipmentResult, membersResult] = await Promise.all([
    supabase.from("workstations").select("*").eq("studio_id", admin.studio_id).order("name"),
    supabase.from("equipment").select("*").eq("studio_id", admin.studio_id).order("display_name"),
    supabase.from("studio_members").select("user_id, profile:profiles!studio_members_user_id_fkey!inner(full_name, avatar_url)").eq("studio_id", admin.studio_id).eq("is_active", true).eq("profile.is_active", true).overrideTypes<MemberRow[], { merge: false }>(),
  ]);
  const failure = workstationsResult.error ?? equipmentResult.error ?? membersResult.error;
  if (failure) throw new Error("Unable to load equipment inventory.", { cause: failure });

  const members = (membersResult.data ?? []).map((row) => ({ id: row.user_id, fullName: row.profile.full_name, avatarUrl: row.profile.avatar_url })).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const memberById = new Map(members.map((member) => [member.id, member]));
  const equipment = (equipmentResult.data ?? []).map(mapEquipment);
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
    workstations: (workstationsResult.data ?? []).map((row: WorkstationRow) => ({
      id: row.id,
      studioId: row.studio_id,
      name: row.name,
      assignedEmployee: row.assigned_employee_id ? memberById.get(row.assigned_employee_id) ?? null : null,
      equipment: equipmentByWorkstation.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}
