// Trusted worker/operator module. Never import this module from client components.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { icecatTimestamp, normalizeIcecatProduct, readIcecatReferences, validateIcecatGeneration, xmlEvents, type CatalogImportRow, type IcecatSkipReason, type XmlInput } from "./icecat";
import { catalogError } from "./diagnostics";

export type IcecatImportOptions = {
  mode: "full" | "daily";
  index: XmlInput;
  suppliers: XmlInput;
  categories: XmlInput;
  maxBytes?: number;
};

type SuggestionPair = {
  type: string;
  manufacturer: string;
  model: string;
  providerProducts: number;
  currentOnMarket: boolean;
  offMarket: boolean;
};

const suggestionText = (value: string) => value.trim().replace(/\s+/gu, " ");
function suggestionPair(row: CatalogImportRow) {
  if (!row.catalog_type || !row.manufacturer || !row.model) return null;
  const manufacturer = suggestionText(row.component_vendor ?? row.manufacturer);
  const model = suggestionText(row.component_model ?? row.model);
  return { type: row.catalog_type, manufacturer, model, key: `${manufacturer.toLowerCase()}\0${model.toLowerCase()}` };
}

function duplicateSummary(pairs: SuggestionPair[]) {
  const counts = pairs.map(pair => pair.providerProducts).sort((a, b) => a - b);
  const middle = Math.floor(counts.length / 2);
  return {
    medianProviderProducts: counts.length ? counts.length % 2 ? counts[middle] : (counts[middle - 1] + counts[middle]) / 2 : 0,
    p95ProviderProducts: counts.length ? counts[Math.ceil(counts.length * 0.95) - 1] : 0,
    maximumDuplicateCount: counts.at(-1) ?? 0,
    topDuplicatePairs: pairs.toSorted((a, b) => b.providerProducts - a.providerProducts || a.type.localeCompare(b.type) || a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model)).slice(0, 20),
  };
}

function suggestionTypeSummary(pairs: SuggestionPair[], totalProviderProducts: number) {
  return {
    totalProviderProducts,
    distinctManufacturerModels: pairs.length,
    deduplicationRatio: totalProviderProducts ? Number(((totalProviderProducts - pairs.length) / totalProviderProducts).toFixed(4)) : 0,
    currentOnMarketDistinctModels: pairs.filter(pair => pair.currentOnMarket).length,
    offMarketDistinctModels: pairs.filter(pair => pair.offMarket).length,
  };
}

export async function importIcecatCatalog(options: IcecatImportOptions, client?: SupabaseClient<Database>) {
  const source = "icecat";
  const runId = randomUUID();
  let completed: string | null = null;
  let claimed = false;
  let generation: string | null = null;
  let seen = 0;
  let imported = 0;
  let skipped = false;
  let phase = client ? "sync claim" : "reference parsing";
  const statistics = client ? null : {
    byType: {} as Record<string, number>,
    productState: { current: 0, onMarket: 0, offMarket: 0, marketUnknown: 0, historical: 0 },
    manufacturers: new Map<string, number>(),
    skipped: { unsupported_category: 0, no_editor_content: 0, limited_product: 0 } satisfies Record<IcecatSkipReason, number>,
    suggestionPairs: new Map<string, Map<string, SuggestionPair>>(),
  };
  const countSkip = statistics ? (reason: IcecatSkipReason) => { statistics.skipped[reason]++; } : undefined;
  const assertSuccess = (result: { error: unknown }) => { if (result.error) throw new Error("Catalog database operation failed", { cause: result.error }); };
  try {
    if (client) {
      const result = await client.rpc("claim_equipment_catalog_sync", { p_source: source, p_run_id: runId });
      assertSuccess(result);
      const state = result.data?.[0];
      if (!state) return { status: "busy" as const, seen, imported, generation };
      completed = state.completed_generation;
      claimed = true;
    }
    phase = "reference parsing";
    const refs = await readIcecatReferences(options.suppliers, options.categories);
    let batch: CatalogImportRow[] = [];
    async function flush() {
      phase = "batch import";
      if (client && generation) assertSuccess(await client.rpc("import_equipment_catalog_batch", { p_source: source, p_run_id: runId, p_generation: generation, p_rows: batch }));
      batch = [];
      phase = "index parsing";
    }
    phase = "index parsing";
    for await (const tag of xmlEvents(options.index, options.maxBytes)) {
      if (tag.name === "files.index") {
        if (generation) throw new Error("Multiple Icecat indexes in one import");
        phase = "index parsing: element=files.index, attribute=Generated";
        generation = icecatTimestamp(tag.attributes.Generated);
        phase = "index parsing";
        // Dry runs validate the feed without requiring a database checkpoint.
        if (client && !validateIcecatGeneration(options.mode, generation, completed)) { skipped = true; break; }
      } else if (tag.name === "file" && tag.path.endsWith("files.index/file")) {
        if (!generation) throw new Error("Icecat index has no generation timestamp");
        seen++;
        const row = normalizeIcecatProduct(tag.attributes, refs, generation, countSkip);
        if (row) {
          batch.push(row); imported++;
          if (statistics) {
            if (row.catalog_type) statistics.byType[row.catalog_type] = (statistics.byType[row.catalog_type] ?? 0) + 1;
            if (row.is_current) {
              statistics.productState.current++;
              if (row.on_market === true) statistics.productState.onMarket++;
              else if (row.on_market === false) statistics.productState.offMarket++;
              else statistics.productState.marketUnknown++;
            } else statistics.productState.historical++;
            if (row.manufacturer) statistics.manufacturers.set(row.manufacturer, (statistics.manufacturers.get(row.manufacturer) ?? 0) + 1);
            const identity = suggestionPair(row);
            if (identity) {
              let pairs = statistics.suggestionPairs.get(identity.type);
              if (!pairs) { pairs = new Map(); statistics.suggestionPairs.set(identity.type, pairs); }
              const pair = pairs.get(identity.key);
              if (pair) {
                pair.providerProducts++;
                pair.currentOnMarket ||= row.is_current === true && row.on_market !== false;
                pair.offMarket ||= row.on_market === false;
              } else pairs.set(identity.key, { type: identity.type, manufacturer: identity.manufacturer, model: identity.model, providerProducts: 1, currentOnMarket: row.is_current === true && row.on_market !== false, offMarket: row.on_market === false });
            }
          }
        }
        // Heartbeat even through irrelevant categories; batch writes remain bounded.
        if (batch.length >= 500 || seen % 5000 === 0) await flush();
      }
    }
    if (!generation) throw new Error("Expected an Icecat files.index document");
    if (!skipped) {
      if (options.mode === "full" && !imported) throw new Error("Full Icecat index contains no supported products");
      await flush();
    }
    phase = "sync completion";
    if (client) assertSuccess(await client.rpc("finish_equipment_catalog_sync", { p_source: source, p_run_id: runId, p_generation: generation }));
    return {
      status: skipped ? "unchanged" as const : client ? "completed" as const : "dry_run" as const,
      seen, imported, generation, mappedCategories: Object.fromEntries(refs.categories),
      ...(statistics ? { statistics: {
        normalizedByType: Object.fromEntries(Object.entries(statistics.byType).sort(([a], [b]) => a.localeCompare(b))),
        productState: statistics.productState,
        distinctManufacturers: statistics.manufacturers.size,
        topManufacturers: [...statistics.manufacturers].sort(([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB)).slice(0, 20).map(([manufacturer, count]) => ({ manufacturer, count })),
        skippedByReason: statistics.skipped,
        canonicalSuggestions: (() => {
          const allPairs = [...statistics.suggestionPairs.values()].flatMap(pairs => [...pairs.values()]);
          const mappingCount = allPairs.reduce((sum, pair) => sum + pair.providerProducts, 0);
          const byType = Object.fromEntries([...statistics.suggestionPairs].sort(([a], [b]) => a.localeCompare(b)).map(([type, pairs]) => [type, suggestionTypeSummary([...pairs.values()], statistics.byType[type] ?? 0)]));
          const lenovo = (type: "laptop" | "pc") => {
            const pairs = [...(statistics.suggestionPairs.get(type)?.values() ?? [])].filter(pair => pair.manufacturer.toLowerCase() === "lenovo");
            return { ...suggestionTypeSummary(pairs, pairs.reduce((sum, pair) => sum + pair.providerProducts, 0)), ...duplicateSummary(pairs) };
          };
          return {
            providerProductCount: imported,
            canonicalModelCount: allPairs.length,
            lightweightMappingCount: mappingCount,
            deduplicationRatio: mappingCount ? Number(((mappingCount - allPairs.length) / mappingCount).toFixed(4)) : 0,
            byType,
            overallDuplicates: duplicateSummary(allPairs),
            lenovo: { laptop: lenovo("laptop"), pc: lenovo("pc") },
          };
        })(),
      } } : {}),
    };
  } catch (error) {
    if (claimed && client) {
      const result = await client.rpc("finish_equipment_catalog_sync", {
        p_source: source, p_run_id: runId, p_generation: generation ?? "1970-01-01T00:00:00",
        p_error: error instanceof Error && error.message.startsWith("Icecat daily coverage gap") ? error.message : "Import failed; completed checkpoint preserved. Inspect worker logs and retry the same feed.",
      });
      assertSuccess(result);
    }
    throw catalogError(`Catalog ${client ? "sync" : "dry-run"}: phase=${phase}, records seen=${seen}, normalized=${imported}`, error);
  }
}

const ICECAT_ROOT = "https://data.icecat.biz/export/freexml/";
export async function* downloadIcecatFile(path: "EN/daily.index.xml.gz" | "refs/SuppliersList.xml.gz" | "refs/CategoriesList.xml.gz", signal: AbortSignal): XmlInput {
  const headers = new Headers();
  if (process.env.ICECAT_API_TOKEN) headers.set("Api-token", process.env.ICECAT_API_TOKEN);
  else if (process.env.ICECAT_USERNAME && process.env.ICECAT_PASSWORD) {
    headers.set("Authorization", `Basic ${Buffer.from(`${process.env.ICECAT_USERNAME}:${process.env.ICECAT_PASSWORD}`).toString("base64")}`);
  } else throw new Error("Icecat credentials are not configured");
  const response = await fetch(new URL(path, ICECAT_ROOT), { headers, signal, redirect: "error", cache: "no-store" });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Icecat feed download failed (HTTP ${response.status})`);
  }
  const reader = response.body.getReader();
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; yield chunk.value; }
  } finally { await reader.cancel(); reader.releaseLock(); }
}

export async function syncIcecatDaily(client: SupabaseClient<Database>) {
  const signal = AbortSignal.timeout(240_000);
  return importIcecatCatalog({ mode: "daily", maxBytes: 512 * 1024 ** 2,
    index: downloadIcecatFile("EN/daily.index.xml.gz", signal),
    suppliers: downloadIcecatFile("refs/SuppliersList.xml.gz", signal),
    categories: downloadIcecatFile("refs/CategoriesList.xml.gz", signal),
  }, client);
}
