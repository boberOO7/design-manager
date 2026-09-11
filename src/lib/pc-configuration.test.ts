import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { equipmentSpecificationSummary } from "@/lib/equipment";
import { EMPTY_PC_CONFIGURATION, hasPcConfiguration, pcConfigurationSchema, pcConfigurationSummaries, parsePcConfigurationFormValue } from "./pc-configuration";

const config = {
  processor: { manufacturer: "Intel", family: "Core i7", model: "14700K" },
  graphics: { mode: "discrete", details: { vendor: "NVIDIA", family: "GeForce RTX", model: "4070 Ti", vramGb: 12 } },
  memory: { capacityGb: 64, generation: "DDR5", moduleCount: 2 },
  drives: [{ type: "nvme_ssd", capacity: 1, unit: "TB" }, { type: "sata_ssd", capacity: 2, unit: "TB" }],
};
const labels = { integrated: "Integrated", other: "Other", professional: "Professional", gb: "GB", tb: "TB", modules: (count: number) => `${count} modules`, drive: (type: string) => type === "nvme_ssd" ? "NVMe SSD" : "SATA SSD" };

describe("PC configuration", () => {
  it("round-trips structured data and ordered drives from form serialization", () => {
    expect(pcConfigurationSchema.parse(parsePcConfigurationFormValue(JSON.stringify(config)))).toEqual(config);
    expect(hasPcConfiguration(EMPTY_PC_CONFIGURATION)).toBe(false);
    expect(parsePcConfigurationFormValue("")).toBeNull();
    expect(pcConfigurationSchema.safeParse(parsePcConfigurationFormValue("{broken")).success).toBe(false);
  });
  it("allows integrated graphics without discrete fields and rejects stale discrete details", () => {
    expect(pcConfigurationSchema.safeParse({ ...config, graphics: { mode: "integrated" } }).success).toBe(true);
    expect(pcConfigurationSchema.safeParse({ ...config, graphics: { mode: "integrated", details: config.graphics.details } }).success).toBe(false);
  });
  it("enforces manufacturer families, capacities, module counts, and drive shape", () => {
    for (const invalid of [
      { processor: { ...config.processor, manufacturer: "AMD" } },
      { graphics: { mode: "discrete", details: { ...config.graphics.details, vendor: "AMD" } } },
      { memory: { ...config.memory, capacityGb: -1 } },
      { memory: { ...config.memory, moduleCount: 1.5 } },
      { drives: [{ type: "nvme_ssd", capacity: 0, unit: "TB" }] },
      { drives: [{ type: "hdd", capacity: 1, unit: "MB" }] },
      { drives: Array.from({ length: 33 }, () => config.drives[0]) },
    ]) expect(pcConfigurationSchema.safeParse({ ...config, ...invalid }).success).toBe(false);
  });
  it("summarizes structured values and retains legacy fallback for unspecified sections", () => {
    const parsed = pcConfigurationSchema.parse(config);
    expect(pcConfigurationSummaries(parsed, labels)).toEqual({ processor: "Intel Core i7 14700K", graphics: "NVIDIA GeForce RTX 4070 Ti · 12 GB", memory: "64 GB · DDR5 · 2 modules", drives: "1 TB NVMe SSD + 2 TB SATA SSD" });
    expect(equipmentSpecificationSummary({ cpu: "old cpu", gpu: "old gpu", ram: "old ram", storage: "unknown drive", pcConfiguration: { ...parsed, drives: [] } }, (value) => pcConfigurationSummaries(value, labels))).toContain("unknown drive");
    expect(pcConfigurationSummaries({ ...parsed, graphics: { mode: "integrated" } }, labels).graphics).toBe("Integrated");
  });
  it("keeps the database JSON constraint identical to the application schema without data rewriting", () => {
    const migration = readFileSync("supabase/migrations/20260911125015_equipment_pc_configuration_schema.sql", "utf8");
    const schema = migration.split("$schema$")[1];
    expect(JSON.parse(schema)).toEqual(z.toJSONSchema(pcConfigurationSchema));
    expect(migration).toContain("pc_configuration is null or equipment_type = 'pc'");
    expect(migration).not.toMatch(/\b(update|delete from|drop column|create table|create policy)\b/i);
  });
});
