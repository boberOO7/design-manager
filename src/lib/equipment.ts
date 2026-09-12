import type { PcConfiguration, pcConfigurationSummaries } from "@/lib/pc-configuration";
import type { Database } from "@/types/database.types";

export type EquipmentType = Database["public"]["Enums"]["equipment_type"];
export type EquipmentLifecycleState = Database["public"]["Enums"]["equipment_lifecycle_state"];
export type EquipmentServiceEventType = Database["public"]["Enums"]["equipment_service_event_type"];
export type MaintenanceUrgency = "overdue" | "upcoming" | null;

export const EQUIPMENT_TYPES = [
  "pc",
  "laptop",
  "monitor",
  "mouse",
  "keyboard",
  "headphones",
  "webcam",
  "air_conditioner",
  "printer",
  "coffee_machine",
  "other",
] as const satisfies readonly EquipmentType[];

export const EQUIPMENT_LIFECYCLE_STATES = ["active", "spare", "in_service", "retired"] as const satisfies readonly EquipmentLifecycleState[];
export const EQUIPMENT_SERVICE_EVENT_TYPES = ["regular_maintenance", "repair", "upgrade"] as const satisfies readonly EquipmentServiceEventType[];
export const COMPUTER_EQUIPMENT_TYPES = ["pc", "laptop"] as const satisfies readonly EquipmentType[];
export const PERIPHERAL_EQUIPMENT_TYPES = ["mouse", "keyboard", "headphones", "webcam"] as const satisfies readonly EquipmentType[];
export const OTHER_EQUIPMENT_TYPES = ["air_conditioner", "printer", "coffee_machine", "other"] as const satisfies readonly EquipmentType[];

const EQUIPMENT_INVENTORY_PREFIXES = {
  pc: "PC",
  laptop: "LAP",
  monitor: "MON",
  mouse: "MOU",
  keyboard: "KBD",
  headphones: "HEAD",
  webcam: "CAM",
  air_conditioner: "AC",
  printer: "PRN",
  coffee_machine: "COF",
  other: "EQ",
} as const satisfies Record<EquipmentType, string>;

const equipmentTypes: ReadonlySet<string> = new Set(EQUIPMENT_TYPES);
const computerEquipmentTypes: ReadonlySet<EquipmentType> = new Set(COMPUTER_EQUIPMENT_TYPES);
const peripheralEquipmentTypes: ReadonlySet<EquipmentType> = new Set(PERIPHERAL_EQUIPMENT_TYPES);
const otherEquipmentTypes: ReadonlySet<EquipmentType> = new Set(OTHER_EQUIPMENT_TYPES);

export function isEquipmentType(type: string): type is EquipmentType {
  return equipmentTypes.has(type);
}

export function isComputerEquipment(type: EquipmentType): type is (typeof COMPUTER_EQUIPMENT_TYPES)[number] {
  return computerEquipmentTypes.has(type);
}

export function isPeripheralEquipment(type: EquipmentType): type is (typeof PERIPHERAL_EQUIPMENT_TYPES)[number] {
  return peripheralEquipmentTypes.has(type);
}

export function isOtherEquipment(type: EquipmentType): type is (typeof OTHER_EQUIPMENT_TYPES)[number] {
  return otherEquipmentTypes.has(type);
}

export function equipmentSpecificationSummary(item: { cpu: string | null; gpu: string | null; ram: string | null; storage: string | null; pcConfiguration?: PcConfiguration | null }, summarize: (config: PcConfiguration) => ReturnType<typeof pcConfigurationSummaries>) {
  const structured = item.pcConfiguration ? summarize(item.pcConfiguration) : null;
  return [structured?.processor || item.cpu, structured?.graphics || item.gpu, structured?.memory || item.ram, structured?.drives || item.storage].filter(Boolean).join(" · ");
}

export function equipmentDisplayName(item: { assetTag: string | null; displayName: string | null; equipmentType: EquipmentType; manufacturer: string | null; model: string | null }) {
  if (item.displayName) return item.displayName;
  if (item.assetTag) return item.assetTag;
  const modelIdentity = [item.manufacturer, item.model].filter((value): value is string => Boolean(value)).join(" ");
  return modelIdentity || item.equipmentType.replaceAll("_", " ");
}

export function equipmentInventoryPrefix(type: EquipmentType) {
  return `${EQUIPMENT_INVENTORY_PREFIXES[type]}-`;
}

export function equipmentInventoryNumber(code: string, type: EquipmentType) {
  const prefix = equipmentInventoryPrefix(type);
  return code.slice(0, prefix.length).toUpperCase() === prefix && /^\d+$/.test(code.slice(prefix.length)) ? code.slice(prefix.length) : "";
}

export function getMaintenanceUrgency(enabled: boolean, dueDate: string | null, today: string): MaintenanceUrgency {
  if (!enabled || !dueDate) return null;
  if (dueDate < today) return "overdue";
  const upcomingLimit = new Date(`${today}T00:00:00.000Z`);
  upcomingLimit.setUTCDate(upcomingLimit.getUTCDate() + 30);
  return dueDate <= upcomingLimit.toISOString().slice(0, 10) ? "upcoming" : null;
}

export function maintenanceDayOffset(dueDate: string, today: string) {
  return Math.round((Date.parse(`${dueDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
}
