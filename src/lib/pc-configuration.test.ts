import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { equipmentInventorySummary, equipmentSpecificationSummary } from "@/lib/equipment";
import { EMPTY_COMPUTER_CONFIGURATION, computerConfigurationSchema, computerConfigurationSummaries, hasComputerConfiguration, parseComputerConfigurationFormValue } from "./pc-configuration";

const config = {
  processor: { manufacturer: "Intel", family: "Core i7", model: "14700K" },
  graphics: { mode: "discrete", details: { vendor: "NVIDIA", family: "GeForce RTX", model: "4070 Ti", vramGb: 12 } },
  memory: { capacityGb: 64, generation: "DDR5", moduleCount: 2 },
  drives: [{ type: "nvme_ssd", capacity: 1, unit: "TB" }, { type: "sata_ssd", capacity: 2, unit: "TB" }],
};
const labels = { integrated: "Integrated", other: "Other", professional: "Professional", gb: "GB", tb: "TB", watts: "W", modules: (count: number) => `${count} modules`, drive: (type: string) => type === "nvme_ssd" ? "NVMe SSD" : "SATA SSD" };

describe("PC configuration", () => {
  it("round-trips structured data and ordered drives from form serialization", () => {
    expect(computerConfigurationSchema.parse(parseComputerConfigurationFormValue(JSON.stringify(config)))).toEqual(config);
    expect(hasComputerConfiguration(EMPTY_COMPUTER_CONFIGURATION)).toBe(false);
    expect(parseComputerConfigurationFormValue("")).toBeNull();
    expect(computerConfigurationSchema.safeParse(parseComputerConfigurationFormValue("{broken")).success).toBe(false);
  });
  it("allows integrated graphics without discrete fields and rejects stale discrete details", () => {
    expect(computerConfigurationSchema.safeParse({ ...config, graphics: { mode: "integrated" } }).success).toBe(true);
    expect(computerConfigurationSchema.safeParse({ ...config, graphics: { mode: "integrated", details: config.graphics.details } }).success).toBe(false);
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
    ]) expect(computerConfigurationSchema.safeParse({ ...config, ...invalid }).success).toBe(false);
  });
  it("summarizes structured values and retains legacy fallback for unspecified sections", () => {
    const parsed = computerConfigurationSchema.parse(config);
    expect(computerConfigurationSummaries(parsed, labels)).toEqual({ processor: "Intel Core i7 14700K", graphics: "NVIDIA GeForce RTX 4070 Ti · 12 GB", memory: "64 GB · DDR5 · 2 modules", drives: "1 TB NVMe SSD + 2 TB SATA SSD", motherboard: "", powerSupply: "" });
    expect(equipmentSpecificationSummary({ cpu: "old cpu", gpu: "old gpu", ram: "old ram", storage: "unknown drive", pcConfiguration: { ...parsed, drives: [] } }, (value) => computerConfigurationSummaries(value, labels))).toContain("unknown drive");
    expect(computerConfigurationSummaries({ ...parsed, graphics: { mode: "integrated" } }, labels).graphics).toBe("Integrated");
  });
  it("models practical PC-only motherboard and power supply details", () => {
    const parsed = computerConfigurationSchema.parse({ ...config, motherboard: { manufacturer: "ASUS", model: "ProArt X670E", chipset: "X670E" }, powerSupply: { manufacturer: "Seasonic", model: "Focus GX", wattage: 850, efficiency: "80 PLUS Gold" } });
    expect(hasComputerConfiguration(parsed)).toBe(true);
    expect(computerConfigurationSummaries(parsed, labels)).toMatchObject({ motherboard: "ASUS · ProArt X670E · X670E", powerSupply: "Seasonic · Focus GX · 850 W · 80 PLUS Gold" });
  });
  it("builds compact type-specific inventory summaries without empty placeholders", () => {
    const parsed = computerConfigurationSchema.parse(config);
    const base = { cpu: null, gpu: null, ram: null, storage: null, pcConfiguration: parsed, manufacturer: null, model: null };
    const summarize = (value: typeof parsed) => computerConfigurationSummaries(value, labels);
    expect(equipmentInventorySummary({ ...base, equipmentType: "pc" }, summarize)).toBe("Intel Core i7 14700K · NVIDIA GeForce RTX 4070 Ti · 12 GB · 64 GB · DDR5 · 2 modules · 1 TB NVMe SSD + 2 TB SATA SSD");
    expect(equipmentInventorySummary({ ...base, equipmentType: "laptop", manufacturer: "Lenovo", model: "ThinkPad P1" }, summarize)).toMatch(/^Lenovo ThinkPad P1 · Intel Core i7/);
    expect(equipmentInventorySummary({ ...base, equipmentType: "monitor", pcConfiguration: null, manufacturer: "Dell", model: "U2723QE" }, summarize)).toBe("Dell U2723QE");
    expect(equipmentInventorySummary({ ...base, equipmentType: "printer", pcConfiguration: null }, summarize)).toBe("");
  });
  it("keeps the database JSON constraint identical to the application schema without data rewriting", () => {
    const migration = readFileSync("supabase/migrations/20260913181519_refine_computer_configuration.sql", "utf8");
    const schema = migration.split("$schema$")[1];
    expect(JSON.parse(schema)).toEqual(z.toJSONSchema(computerConfigurationSchema));
    expect(migration).toContain("pc_configuration is null or equipment_type in ('pc', 'laptop')");
    expect(migration).not.toMatch(/\b(update|delete from|drop column|create table|create policy)\b/i);
  });
});
