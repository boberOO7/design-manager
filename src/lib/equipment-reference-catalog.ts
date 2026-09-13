import { z } from "zod";
import { EQUIPMENT_TYPES } from "@/lib/equipment";

export const COMMON_EQUIPMENT_MANUFACTURERS = {
  pc: ["Dell", "HP", "Lenovo", "ASUS", "Acer", "Apple", "MSI"],
  laptop: ["Lenovo", "Dell", "HP", "Apple", "ASUS", "Acer", "Microsoft"],
  monitor: ["Dell", "LG", "Samsung", "ASUS", "BenQ", "Philips", "Acer", "Lenovo"],
  mouse: ["Logitech", "Razer", "Microsoft", "SteelSeries", "Corsair", "HP", "Dell"],
  keyboard: ["Logitech", "Razer", "Microsoft", "Keychron", "SteelSeries", "Corsair", "HP", "Dell"],
  headphones: ["Logitech", "Sony", "Jabra", "Sennheiser", "JBL", "HyperX", "SteelSeries", "Apple"],
  webcam: ["Logitech", "Microsoft", "Razer", "Elgato", "Poly", "Dell"],
  air_conditioner: ["Daikin", "Mitsubishi Electric", "LG", "Samsung", "Gree", "Midea", "Haier", "TOSOT"],
  printer: ["HP", "Canon", "Brother", "Epson", "Xerox", "Kyocera", "Ricoh", "Lexmark"],
  coffee_machine: ["De'Longhi", "Philips", "Jura", "Krups", "Saeco", "Bosch", "Nespresso"],
  other: [], cpu: [], gpu: [],
} as const satisfies Record<(typeof EQUIPMENT_TYPES)[number] | "cpu" | "gpu", readonly string[]>;

export const equipmentCatalogSearchSchema = z.object({
  type: z.enum([...EQUIPMENT_TYPES, "cpu", "gpu"]),
  field: z.enum(["manufacturer", "model"]).default("model"),
  manufacturer: z.string().trim().max(160).default(""),
  family: z.string().trim().max(160).default(""),
  query: z.string().trim().max(160).default(""),
});
export type EquipmentCatalogSearch = z.infer<typeof equipmentCatalogSearchSchema>;
export const equipmentCatalogResultsSchema = z.object({ suggestions: z.array(z.string().max(160)).max(12) });

export function equipmentManufacturerSuggestions(type: EquipmentCatalogSearch["type"], query: string, catalog: readonly string[]) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  return [...COMMON_EQUIPMENT_MANUFACTURERS[type], ...catalog]
    .map(value => value.trim()).filter(value => value && value.toLocaleLowerCase().includes(normalizedQuery))
    .filter(value => { const key = value.toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 10);
}
