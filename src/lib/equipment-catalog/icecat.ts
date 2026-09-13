import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { SaxesParser } from "saxes";
import { z } from "zod";
import { CPU_FAMILIES, GPU_FAMILIES } from "@/lib/pc-configuration";
import { catalogError } from "./diagnostics";

export type CatalogImportRow = {
  source_product_id: string;
  source_updated_at: string;
  is_current: boolean;
  catalog_type?: string;
  source_category_id?: string;
  manufacturer?: string;
  model?: string;
  product_code?: string | null;
  component_vendor?: string | null;
  family?: string | null;
  component_model?: string | null;
  on_market?: boolean | null;
  popularity?: number;
};
export type XmlInput = AsyncIterable<Uint8Array>;
export type IcecatSkipReason = "unsupported_category" | "no_editor_content" | "limited_product";

// Resolve these exact English leaf-category names against each CategoriesList.
// No descendants, accessories, consumables, or catch-all "other" imports.
export const ICECAT_CATEGORIES: Readonly<Record<string, string>> = {
  "PCs/Workstations": "pc", "Notebooks": "laptop", "Laptops": "laptop",
  "Computer Monitors": "monitor", "Mice": "mouse", "Keyboards": "keyboard",
  "Headphones & Headsets": "headphones", "Webcams": "webcam",
  "Laser Printers": "printer", "Inkjet Printers": "printer", "Multifunction Printers": "printer",
  "Air Conditioners": "air_conditioner", "Split-System Air Conditioners": "air_conditioner",
  "Mobile Air Conditioners": "air_conditioner", "Coffee Makers": "coffee_machine",
  "Processors": "cpu", "Graphics Cards": "gpu",
};

// Preserve the provider's wall clock. Do not silently label it UTC (see runbook).
export function icecatTimestamp(value: string) {
  if (!/^\d{14}$/.test(value)) throw new Error("Invalid Icecat timestamp");
  const iso = `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:${value.slice(10,12)}:${value.slice(12,14)}`;
  if (!Number.isFinite(Date.parse(`${iso}Z`)) || new Date(`${iso}Z`).toISOString().slice(0,19) !== iso) throw new Error("Invalid Icecat timestamp");
  return iso;
}

export async function* xmlEvents(input: XmlInput, maxBytes = 8 * 1024 ** 3) {
  const iterator = input[Symbol.asyncIterator]();
  let prefix = Buffer.alloc(0);
  while (prefix.length < 2) {
    const next = await iterator.next();
    if (next.done) break;
    prefix = Buffer.concat([prefix, next.value]);
  }
  async function* bytes() {
    try {
      yield prefix;
      for (;;) { const next = await iterator.next(); if (next.done) break; yield next.value; }
    } finally { await iterator.return?.(); }
  }
  const raw = Readable.from(bytes());
  const stream = prefix[0] === 0x1f && prefix[1] === 0x8b ? raw.compose(createGunzip()) : raw;
  const parser = new SaxesParser({ xmlns: false });
  const stack: { name: string; attributes: Record<string,string> }[] = [];
  let events: { name: string; attributes: Record<string,string>; path: string; categoryId?: string }[] = [];
  let total = 0;
  let unclosedBytes = 0;
  parser.on("doctype", (doctype) => { if (doctype.includes("[")) throw new Error("Internal XML entities are not supported"); });
  parser.on("opentag", (tag) => {
    unclosedBytes = 0;
    events.push({ name: tag.name, attributes: tag.attributes, path: [...stack.map(t => t.name), tag.name].join("/"), categoryId: stack.find(t => t.name === "Category")?.attributes.ID });
    stack.push(tag);
  });
  parser.on("closetag", () => { stack.pop(); unclosedBytes = 0; });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for await (const chunk of stream) {
      const data: unknown = chunk;
      if (!(data instanceof Uint8Array)) throw new Error("Expected XML bytes");
      total += data.byteLength;
      if (total > maxBytes) throw new Error(`Icecat feed exceeds import byte limit (decompressed bytes=${total}, limit=${maxBytes})`);
      // Bound parser tokens even when a transport supplies unusually large chunks.
      for (let offset = 0; offset < data.length; offset += 65536) {
        const part = data.subarray(offset, offset + 65536);
        unclosedBytes += part.length;
        if (unclosedBytes > 2 * 1024 ** 2) throw new Error("Icecat XML token exceeds limit");
        parser.write(decoder.decode(part, { stream: true }));
        yield* events;
        events = [];
      }
    }
    parser.write(decoder.decode()).close();
    yield* events;
  } catch (error) {
    throw catalogError(`XML parsing: line=${parser.line}, column=${parser.column}, element=${stack.at(-1)?.name ?? "document"}, category=${stack.find(t => t.name === "Category")?.attributes.ID ?? "unknown"}`, error);
  } finally { stream.destroy(); raw.destroy(); await iterator.return?.(); }
}

export async function readIcecatReferences(suppliersInput: XmlInput, categoriesInput: XmlInput) {
  const suppliers = new Map<string,string>();
  const categories = new Map<string,string>();
  let context = "reference parsing: SuppliersList";
  try {
    for await (const tag of xmlEvents(suppliersInput, 64 * 1024 ** 2)) {
      if (tag.name === "Supplier" && tag.path.endsWith("SuppliersList/Supplier")) {
        context = `reference parsing: SuppliersList, element=Supplier, ID=${tag.attributes.ID}`;
        const a = z.object({ ID: z.string().regex(/^\d+$/), Name: z.string().trim().min(1).max(160) }).parse(tag.attributes);
        suppliers.set(a.ID, a.Name);
        context = "reference parsing: SuppliersList";
      }
    }
    context = "reference parsing: CategoriesList";
    for await (const tag of xmlEvents(categoriesInput, 256 * 1024 ** 2)) {
      if (tag.name === "Name" && tag.categoryId && !tag.path.includes("ParentCategory") && tag.attributes.langid === "1") {
        const type = ICECAT_CATEGORIES[tag.attributes.Value];
        if (type) {
          context = `category resolution: element=Category, attribute=ID, category=${tag.categoryId}, name=${tag.attributes.Value}`;
          categories.set(id.parse(tag.categoryId), type);
          context = "reference parsing: CategoriesList";
        }
      }
    }
    context = "category resolution";
    if (!suppliers.size || !categories.size) throw new Error(`Icecat references are empty or unsupported (suppliers=${suppliers.size}, mapped categories=${categories.size})`);
    return { suppliers, categories };
  } catch (error) { throw catalogError(context, error); }
}

function componentFamilyPattern(type: string, family: string) {
  if (type === "cpu") {
    if (family.startsWith("Ryzen ")) return `(?:AMD\\s+)?${family.replaceAll(" ", "\\s+")}`;
    if (family === "Threadripper") return "(?:AMD\\s+)?(?:Ryzen\\s+)?Threadripper";
    if (family.startsWith("Core ")) return `(?:Intel\\s+)?${family.replaceAll(" ", "\\s+")}`;
    if (family === "Xeon") return "(?:Intel\\s+)?Xeon";
  }
  return family.replaceAll(" ", "\\s+");
}

function semanticGpuModel(family: string, value: string) {
  const pattern = family === "GeForce RTX" || family === "GeForce GTX"
    ? /^(\d{3,4})\s*(Ti)?(?:\s*(SUPER))?\b/i
    : family === "Radeon RX" ? /^(\d{3,4})\s*(XTX|XT|GRE|M)?\b/i
      : family === "Intel Arc" || family === "Arc" ? /^([AB]\d{3})\b/i : null;
  const match = pattern?.exec(value);
  if (!match) return value;
  return match.slice(1).filter(Boolean).map(part => part.toUpperCase() === "TI" ? "Ti" : part.toUpperCase()).join(" ");
}

function componentIdentity(type: string, manufacturer: string, model: string) {
  const clean = model.replace(/[®™]/g, "").replace(/\s+/g, " ").trim();
  const families = type === "cpu" ? CPU_FAMILIES : GPU_FAMILIES;
  for (const [vendor, names] of Object.entries(families)) {
    for (const family of names) {
      if (family === "Other" || family === "Professional") continue;
      const match = new RegExp(`\\b${componentFamilyPattern(type, family)}[\\s-]+(.+)$`, "i").exec(clean);
      if (match) return { component_vendor: vendor, family, component_model: type === "gpu" ? semanticGpuModel(family, match[1].trim()) : match[1].trim() };
    }
  }
  // ponytail: only explicit family names are recognized; add feature enrichment if coverage requires it.
  return { component_vendor: manufacturer, family: "Other", component_model: clean };
}

const id = z.string().regex(/^[1-9]\d*$/).max(100);
const text = z.string().trim().min(1).max(160);
export function normalizeIcecatProduct(a: Record<string,string>, refs: Awaited<ReturnType<typeof readIcecatReferences>>, generation: string, onSkip?: (reason: IcecatSkipReason) => void): CatalogImportRow | null {
  const field = <T>(attribute: string, parse: () => T): T => {
    try { return parse(); }
    catch (error) { throw catalogError(`normalization: element=file, Product_ID=${a.Product_ID}, category=${a.Catid}, Supplier_id=${a.Supplier_id}, attribute=${attribute}`, error); }
  };
  // Removal entries may lack category and supplier attributes: update by stable ID.
  if (a.Quality?.toUpperCase() === "REMOVED") return { source_product_id: field("Product_ID", () => id.parse(a.Product_ID)), source_updated_at: a.Updated ? field("Updated", () => icecatTimestamp(a.Updated)) : generation, is_current: false };
  const type = refs.categories.get(a.Catid);
  if (!type) { onSkip?.("unsupported_category"); return null; }
  if (a.Quality === "NOEDITOR") { onSkip?.("no_editor_content"); return null; }
  if (a.Limited?.toLowerCase() === "yes") { onSkip?.("limited_product"); return null; }
  const manufacturer = field("Supplier_id -> Supplier.Name", () => text.parse(refs.suppliers.get(a.Supplier_id)));
  // Some index names include an entire specification; retain the exact MPN
  // when the name cannot fit StudioFlow's existing equipment value limit.
  const modelName = a.Model_Name?.trim();
  const useModelName = modelName && modelName.length <= 160;
  const model = field(useModelName ? "Model_Name" : "Prod_ID", () => text.parse(useModelName ? modelName : a.Prod_ID));
  const onMarket = field("On_Market", () => z.enum(["0", "1"]).optional().parse(a.On_Market || undefined));
  return {
    source_product_id: field("Product_ID", () => id.parse(a.Product_ID)), catalog_type: type, source_category_id: a.Catid,
    manufacturer, model, product_code: a.Prod_ID?.trim() ? field("Prod_ID", () => text.parse(a.Prod_ID)) : null,
    ...(type === "cpu" || type === "gpu" ? componentIdentity(type, manufacturer, model) : {}),
    is_current: true, on_market: onMarket ? onMarket === "1" : null,
    popularity: field("Product_View", () => z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(a.Product_View || 0)),
    source_updated_at: field("Updated", () => icecatTimestamp(a.Updated)),
  };
}

export function validateIcecatGeneration(mode: "full" | "daily", generation: string, completed: string | null) {
  if (completed && generation <= completed) return false;
  if (mode === "daily" && (!completed || Date.parse(generation.slice(0,10)) - Date.parse(completed.slice(0,10)) > 86400000)) {
    throw new Error("Icecat daily coverage gap: run an explicit full import before resuming daily sync");
  }
  return true;
}
