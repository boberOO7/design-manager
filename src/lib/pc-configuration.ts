import { z } from "zod";

export const CPU_FAMILIES = {
  AMD: ["Ryzen 3", "Ryzen 5", "Ryzen 7", "Ryzen 9", "Threadripper", "Other"],
  Intel: ["Core i3", "Core i5", "Core i7", "Core i9", "Core Ultra 5", "Core Ultra 7", "Core Ultra 9", "Xeon", "Other"],
} as const;
export const GPU_FAMILIES = {
  NVIDIA: ["GeForce GTX", "GeForce RTX", "Professional", "Other"],
  AMD: ["Radeon RX", "Radeon Pro", "Other"],
  Intel: ["Arc", "Other"],
  Other: ["Other"],
} as const;
export const MEMORY_TYPES = ["DDR3", "DDR4", "DDR5", "Other"] as const;
export const DRIVE_TYPES = ["nvme_ssd", "sata_ssd", "hdd", "other"] as const;
export const CAPACITY_UNITS = ["GB", "TB"] as const;
const model = z.string().max(160).nullable();
const capacity = z.number().positive().max(1_000_000);
const processor = z.discriminatedUnion("manufacturer", [
  z.strictObject({ manufacturer: z.literal("AMD"), family: z.enum(CPU_FAMILIES.AMD).nullable(), model }),
  z.strictObject({ manufacturer: z.literal("Intel"), family: z.enum(CPU_FAMILIES.Intel).nullable(), model }),
]);
const graphics = z.discriminatedUnion("vendor", [
  z.strictObject({ vendor: z.literal("NVIDIA"), family: z.enum(GPU_FAMILIES.NVIDIA).nullable(), model, vramGb: capacity.nullable() }),
  z.strictObject({ vendor: z.literal("AMD"), family: z.enum(GPU_FAMILIES.AMD).nullable(), model, vramGb: capacity.nullable() }),
  z.strictObject({ vendor: z.literal("Intel"), family: z.enum(GPU_FAMILIES.Intel).nullable(), model, vramGb: capacity.nullable() }),
  z.strictObject({ vendor: z.literal("Other"), family: z.enum(GPU_FAMILIES.Other).nullable(), model, vramGb: capacity.nullable() }),
]);

// A PC-owned document: component configuration has no independent inventory lifecycle.
export const pcConfigurationSchema = z.strictObject({
  processor: processor.nullable(),
  graphics: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("integrated") }),
    z.strictObject({ mode: z.literal("discrete"), details: graphics }),
  ]).nullable(),
  memory: z.strictObject({ capacityGb: capacity.nullable(), generation: z.enum(MEMORY_TYPES).nullable(), moduleCount: z.number().int().min(1).max(128).nullable() }),
  drives: z.array(z.strictObject({ type: z.enum(DRIVE_TYPES), capacity, unit: z.enum(CAPACITY_UNITS) })).max(32),
});
export type PcConfiguration = z.infer<typeof pcConfigurationSchema>;
export const EMPTY_PC_CONFIGURATION: PcConfiguration = { processor: null, graphics: null, memory: { capacityGb: null, generation: null, moduleCount: null }, drives: [] };

export function hasPcConfiguration(config: PcConfiguration) {
  return Boolean(config.processor || config.graphics || config.drives.length || Object.values(config.memory).some((value) => value !== null));
}

export function parsePcConfigurationFormValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
}

export function pcConfigurationSummaries(config: PcConfiguration, labels: { integrated: string; other: string; professional: string; gb: string; tb: string; modules: (count: number) => string; drive: (type: PcConfiguration["drives"][number]["type"]) => string }) {
  const family = (value: string | null) => value === "Other" ? labels.other : value === "Professional" ? labels.professional : value;
  const cpu = config.processor;
  const gpu = config.graphics?.mode === "discrete" ? config.graphics.details : null;
  return {
    processor: cpu ? [cpu.manufacturer, family(cpu.family), cpu.model].filter(Boolean).join(" ") : "",
    graphics: config.graphics?.mode === "integrated" ? labels.integrated : gpu ? [[gpu.vendor === "Other" ? labels.other : gpu.vendor, family(gpu.family), gpu.model].filter(Boolean).join(" "), gpu.vramGb && `${gpu.vramGb} ${labels.gb}`].filter(Boolean).join(" · ") : "",
    memory: [config.memory.capacityGb && `${config.memory.capacityGb} ${labels.gb}`, family(config.memory.generation), config.memory.moduleCount && labels.modules(config.memory.moduleCount)].filter(Boolean).join(" · "),
    drives: config.drives.map((drive) => `${drive.capacity} ${drive.unit === "TB" ? labels.tb : labels.gb} ${labels.drive(drive.type)}`).join(" + "),
  };
}
