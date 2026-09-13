import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { icecatTimestamp, normalizeIcecatProduct, readIcecatReferences, validateIcecatGeneration, xmlEvents } from "./icecat";
import { downloadIcecatFile, importIcecatCatalog } from "./sync";
import { catalogError, formatCatalogError } from "./diagnostics";

const bytes = (s: string) => Readable.from([Buffer.from(s)]);
const suppliers = '<ICECAT-interface><SuppliersList><Supplier ID="1" Name="Dell &amp; Co"/><Supplier ID="2" Name="Intel"/><Supplier ID="3" Name="ASUS"/></SuppliersList></ICECAT-interface>';
const categories = '<ICECAT-interface><CategoriesList><Category ID="10"><Name langid="1" Value="Computer Monitors"/></Category><Category ID="20"><Name langid="1" Value="Processors"/></Category><Category ID="30"><Name langid="1" Value="Graphics Cards"/></Category><Category ID="40"><Name langid="1" Value="Ink Cartridges"/><ParentCategory><Name langid="1" Value="Computer Monitors"/></ParentCategory></Category></CategoriesList></ICECAT-interface>';
const attrs = { Product_ID: "123", Updated: "20260911010203", Quality: "ICECAT", Supplier_id: "1", Catid: "10", Model_Name: "U2723QE", Prod_ID: "DELL-U2723QE", On_Market: "1", Product_View: "45" };
const file = (overrides: Record<string,string> = {}) => `<file ${Object.entries({ ...attrs, ...overrides }).map(([key, value]) => `${key}="${value}"`).join(" ")}><EAN_UPCS><EAN_UPC Value="123456789"/></EAN_UPCS></file>`;
const options = (xml = `<files.index Generated="20260912020000">${file()}</files.index>`) => ({ mode: "full" as const, index: bytes(xml), suppliers: bytes(suppliers), categories: bytes(categories) });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Icecat streaming imports", () => {
  it("parses gzip, split Unicode/entities, self-closing and nested tags without importing accessories", async () => {
    const gz = gzipSync(suppliers);
    const chunks = Readable.from(Array.from(gz, byte => Buffer.from([byte])));
    const refs = await readIcecatReferences(chunks, bytes(categories));
    expect(refs.suppliers.get("1")).toBe("Dell & Co");
    expect(refs.categories.has("40")).toBe(false);
    expect(normalizeIcecatProduct(attrs, refs, "2026-09-12T02:00:00")).toMatchObject({ source_product_id: "123", manufacturer: "Dell & Co", model: "U2723QE", on_market: true, popularity: 45 });
    expect(normalizeIcecatProduct({ ...attrs, Catid: "40" }, refs, "2026-09-12T02:00:00")).toBeNull();
    const skipped: string[] = [];
    expect(normalizeIcecatProduct({ ...attrs, Limited: "Yes" }, refs, "2026-09-12T02:00:00", reason => skipped.push(reason))).toBeNull();
    expect(skipped).toEqual(["limited_product"]);
    expect(await importIcecatCatalog(options())).toMatchObject({ status: "dry_run", seen: 1, imported: 1 });
  });
  it("preserves out-of-market models and removal identities, without inventing product data", async () => {
    const refs = await readIcecatReferences(bytes(suppliers), bytes(categories));
    expect(normalizeIcecatProduct({ ...attrs, On_Market: "0" }, refs, "2026-09-12T02:00:00")).toMatchObject({ on_market: false, is_current: true });
    expect(normalizeIcecatProduct({ Product_ID: "123", Quality: "REMOVED" }, refs, "2026-09-12T02:00:00")).toEqual({ source_product_id: "123", source_updated_at: "2026-09-12T02:00:00", is_current: false });
    expect(() => normalizeIcecatProduct({ ...attrs, Product_ID: "0" }, refs, "2026-09-12T02:00:00")).toThrow();
  });
  it("uses the exact product code when a source model name exceeds the equipment limit", async () => {
    const refs = await readIcecatReferences(bytes(suppliers), bytes(categories));
    const longName = 'Aspire 9104WLMi, Centrino 2.0GHz Dothan 760, XPH SP2, 15.4" WXGA CrystalBrite, 512MB RAM, 80GB, DVD+/-RW, 802.11g, ATI X600 128MB, PCMCIA Remote Control + TV Tuner';
    expect(normalizeIcecatProduct({ ...attrs, Model_Name: longName, Prod_ID: 'LX.A5205.060' }, refs, '2026-09-12T02:00:00')).toMatchObject({ model: 'LX.A5205.060', product_code: 'LX.A5205.060' });
    expect(normalizeIcecatProduct({ ...attrs, Model_Name: 'x'.repeat(160) }, refs, '2026-09-12T02:00:00')?.model).toHaveLength(160);
    expect(() => normalizeIcecatProduct({ ...attrs, Model_Name: longName, Prod_ID: '' }, refs, '2026-09-12T02:00:00')).toThrow('attribute=Prod_ID');
  });
  it("derives CPU and GPU chip identity from model text instead of the OEM or board supplier", async () => {
    const refs = await readIcecatReferences(bytes(suppliers), bytes(categories));
    expect(normalizeIcecatProduct({ ...attrs, Catid: "20", Supplier_id: "2", Model_Name: "Core i7-14700KF" }, refs, "2026-09-12T02:00:00")).toMatchObject({ component_vendor: "Intel", family: "Core i7", component_model: "14700KF" });
    expect(normalizeIcecatProduct({ ...attrs, Catid: "20", Supplier_id: "3", Model_Name: "AMD Ryzen 7 7700X" }, refs, "2026-09-12T02:00:00")).toMatchObject({ manufacturer: "ASUS", component_vendor: "AMD", family: "Ryzen 7", component_model: "7700X" });
    expect(normalizeIcecatProduct({ ...attrs, Catid: "20", Supplier_id: "1", Model_Name: "Intel Core i7-14700K" }, refs, "2026-09-12T02:00:00")).toMatchObject({ manufacturer: "Dell & Co", component_vendor: "Intel", family: "Core i7", component_model: "14700K" });
    expect(normalizeIcecatProduct({ ...attrs, Catid: "20", Supplier_id: "1", Model_Name: "Unrecognized embedded processor" }, refs, "2026-09-12T02:00:00")).toMatchObject({ component_vendor: "Dell & Co", family: "Other", component_model: "Unrecognized embedded processor" });
    expect(normalizeIcecatProduct({ ...attrs, Catid: "30", Supplier_id: "3", Model_Name: "GeForce RTX 4070 VENTUS 2X" }, refs, "2026-09-12T02:00:00")).toMatchObject({ manufacturer: "ASUS", component_vendor: "NVIDIA", family: "GeForce RTX", component_model: "4070" });
    expect(normalizeIcecatProduct({ ...attrs, Catid: "30", Supplier_id: "3", Model_Name: "GeForce RTX 4070 Ti SUPER GAMING OC" }, refs, "2026-09-12T02:00:00")).toMatchObject({ component_vendor: "NVIDIA", family: "GeForce RTX", component_model: "4070 Ti SUPER" });
    expect(normalizeIcecatProduct({ ...attrs, Catid: "30", Supplier_id: "3", Model_Name: "GeForce RTX workstation custom" }, refs, "2026-09-12T02:00:00")).toMatchObject({ component_vendor: "NVIDIA", family: "GeForce RTX", component_model: "workstation custom" });
    const result = await importIcecatCatalog(options(`<files.index Generated="20260912020000">${file({ Product_ID: "130", Catid: "30", Supplier_id: "3", Model_Name: "GeForce RTX 4070 VENTUS 2X" })}${file({ Product_ID: "131", Catid: "30", Supplier_id: "3", Model_Name: "GeForce RTX 4070 GAMING OC" })}</files.index>`));
    if (!("statistics" in result) || !result.statistics) throw new Error("Expected dry-run statistics");
    expect(result.statistics.canonicalSuggestions.byType.gpu).toMatchObject({ totalProviderProducts: 2, distinctManufacturerModels: 1 });
  });
  it("rejects malformed/truncated XML, error documents, internal entities and oversized input", async () => {
    for (const xml of ['<files.index Generated="20260912020000"><file', '<Error>Unauthorized</Error>', '<!DOCTYPE x [<!ENTITY x "expanded">]><x>&x;</x>']) {
      await expect(importIcecatCatalog(options(xml))).rejects.toThrow();
    }
    await expect(importIcecatCatalog({ ...options(), maxBytes: 10 }).catch(error => formatCatalogError(error))).resolves.toContain("byte limit");
    const events = async () => { for await (const tag of xmlEvents(bytes('<x a="' + 'x'.repeat(3 * 1024 ** 2) + '"/>'))) void tag; };
    await expect(events().catch(error => formatCatalogError(error))).resolves.toContain("token exceeds");
  });
  it("accepts reference files beyond the former 128 MiB cap while streaming", async () => {
    async function* largeCategories() {
      yield Buffer.from(categories.replace('</CategoriesList></ICECAT-interface>', ''));
      const comment = Buffer.from(`<Description>${' '.repeat(65536)}</Description>`);
      for (let i = 0; i < 2048; i++) yield comment;
      yield Buffer.from('</CategoriesList></ICECAT-interface>');
    }
    const refs = await readIcecatReferences(bytes(suppliers), largeCategories());
    expect(refs.categories.get("10")).toBe("monitor");
  }, 20000);
  it("reports phase, XML position, category and validation attribute with the original cause", async () => {
    const diagnostic = (xml: string) => importIcecatCatalog(options(xml)).catch(error => formatCatalogError(error));
    const malformed = await diagnostic('<files.index Generated="20260912020000"><file></files.index>');
    expect(malformed).toContain("phase=index parsing");
    expect(malformed).toContain("line=1");
    expect(malformed).toContain("unexpected close tag");
    const invalid = await diagnostic(`<files.index Generated="20260912020000">${file({ On_Market: "unknown" })}</files.index>`);
    expect(invalid).toContain("normalization: element=file, Product_ID=123, category=10");
    expect(invalid).toContain("attribute=On_Market");
    expect(invalid).toContain('expected one of "0"|"1"');
    const reference = await importIcecatCatalog({ ...options(), suppliers: bytes('<SuppliersList><Supplier ID="1" Name=""/></SuppliersList>') }).catch(error => formatCatalogError(error));
    expect(reference).toContain("reference parsing: SuppliersList, element=Supplier, ID=1");
    expect(reference).toContain("Name: Too small");
  });
  it("redacts operator secrets and bounds payloads without losing unexpected stacks/causes", () => {
    const env = { ICECAT_API_TOKEN: 'private/token', ICECAT_USERNAME: 'operator', ICECAT_PASSWORD: 'private-password' };
    const credentials = Buffer.from(`${env.ICECAT_USERNAME}:${env.ICECAT_PASSWORD}`).toString('base64');
    const root = new TypeError(`Unexpected input ${env.ICECAT_API_TOKEN} ${encodeURIComponent(env.ICECAT_API_TOKEN)} ${credentials} https://example.test/path?key=hidden postgres://dbuser:dbpass@example.test/db token=unconfigured Bearer another-secret`);
    const result = formatCatalogError(catalogError('index parsing', root), env);
    for (const secret of [...Object.values(env), credentials, encodeURIComponent(env.ICECAT_API_TOKEN), 'hidden', 'dbuser', 'dbpass', 'unconfigured', 'another-secret']) expect(result).not.toContain(secret);
    expect(result).toContain('TypeError: Unexpected input');
    expect(result).toContain('Caused by:');
    expect(result).toContain('icecat.test.ts:');
    const huge = formatCatalogError(new Error(`<file data="${'x'.repeat(100000)}"/>`, { cause: root }), env);
    expect(huge.length).toBeLessThan(16000);
    expect(huge).toContain('[XML omitted]');
    expect(huge).toContain('TypeError: Unexpected input');
    expect(formatCatalogError(new Error('x'.repeat(20000)), env)).toContain('icecat.test.ts:');
    expect(formatCatalogError({ code: 'TEST', message: 'SDK failed', payload: 'do not dump' }, env)).toBe('code: TEST; message: SDK failed');
  });
  it("keeps expected skips quiet and dry runs independent of database credentials/network", async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
    const errors = vi.spyOn(console, 'error');
    const warnings = vi.spyOn(console, 'warn');
    const xml = `<files.index Generated="20260912020000">${file()}${file({ Product_ID: '124', On_Market: '0' })}${file({ Product_ID: '125', Quality: 'REMOVED' })}${file({ Catid: '40', Product_ID: 'invalid' })}${file({ Product_ID: '126', Limited: 'Yes' })}${file({ Product_ID: '127', Quality: 'NOEDITOR' })}</files.index>`;
    expect(await importIcecatCatalog(options(xml))).toMatchObject({
      status: 'dry_run', seen: 6, imported: 3,
      statistics: {
        normalizedByType: { monitor: 2 },
        productState: { current: 2, onMarket: 1, offMarket: 1, marketUnknown: 0, historical: 1 },
        distinctManufacturers: 1,
        topManufacturers: [{ manufacturer: 'Dell & Co', count: 2 }],
        skippedByReason: { unsupported_category: 1, limited_product: 1, no_editor_content: 1 },
        canonicalSuggestions: {
          providerProductCount: 3,
          canonicalModelCount: 1,
          lightweightMappingCount: 2,
          deduplicationRatio: 0.5,
          byType: { monitor: {
            totalProviderProducts: 2, distinctManufacturerModels: 1, deduplicationRatio: 0.5,
            currentOnMarketDistinctModels: 1, offMarketDistinctModels: 1,
          } },
        },
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });
  it("canonicalizes only case and whitespace for dry-run suggestion identity", async () => {
    const extraSuppliers = suppliers.replace('</SuppliersList>', '<Supplier ID="4" Name="dell   &amp; CO"/></SuppliersList>');
    const xml = `<files.index Generated="20260912020000">${file()}${file({ Product_ID: '124', Supplier_id: '4', Model_Name: '  u2723qe  ' })}${file({ Product_ID: '125', Model_Name: 'U2723QE-S' })}</files.index>`;
    const result = await importIcecatCatalog({ ...options(xml), suppliers: bytes(extraSuppliers) });
    if (!("statistics" in result) || !result.statistics) throw new Error("Expected dry-run statistics");
    expect(result.statistics.canonicalSuggestions.byType.monitor).toMatchObject({
      totalProviderProducts: 3, distinctManufacturerModels: 2, deduplicationRatio: 0.3333,
    });
    expect(result.statistics.canonicalSuggestions.overallDuplicates).toMatchObject({ medianProviderProducts: 1.5, p95ProviderProducts: 2, maximumDuplicateCount: 2 });
    expect(result.statistics.canonicalSuggestions.overallDuplicates.topDuplicatePairs[0]).toMatchObject({ manufacturer: 'Dell & Co', model: 'U2723QE', providerProducts: 2 });
  });
  it("prints actionable CLI diagnostics before the concise failure, without Supabase configuration", () => {
    const dir = mkdtempSync(join(tmpdir(), 'icecat-cli-'));
    try {
      writeFileSync(join(dir, 'suppliers.xml'), suppliers);
      writeFileSync(join(dir, 'categories.xml'), categories);
      const index = join(dir, 'index.xml');
      const run = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/sync-equipment-catalog.ts', '--index', index, '--suppliers', join(dir, 'suppliers.xml'), '--categories', join(dir, 'categories.xml')], {
        encoding: 'utf8', timeout: 10000,
        env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', ICECAT_API_TOKEN: 'private-cli-token' },
      });
      writeFileSync(index, `<files.index Generated="20260912020000">${file()}</files.index>`);
      const success = run();
      expect(success.error).toBeUndefined();
      expect(success.status).toBe(0);
      expect(success.stdout).toContain("status: 'dry_run'");
      expect(success.stdout).toContain("manufacturer: 'Dell & Co'");
      expect(success.stderr).toBe('');
      writeFileSync(index, `<files.index Generated="20260912020000">${file({ On_Market: 'private-cli-token' })}</files.index>`);
      const failure = run();
      expect(failure.status).toBe(1);
      expect(failure.stderr).toContain('attribute=On_Market');
      expect(failure.stderr).toContain('expected one of "0"|"1"');
      expect(failure.stderr.trim()).toMatch(/Catalog import failed\. See the diagnostic above\.$/);
      expect(failure.stderr).not.toMatch(/private-cli-token|Supabase|migration status/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("compares provider generations, detects gaps, and preserves wall-clock timestamps", () => {
    expect(icecatTimestamp("20260912020000")).toBe("2026-09-12T02:00:00");
    expect(() => icecatTimestamp("20260230000000")).toThrow();
    expect(validateIcecatGeneration("daily", "2026-09-12T02:00:00", "2026-09-11T03:00:00")).toBe(true);
    expect(validateIcecatGeneration("daily", "2026-09-12T02:00:00", "2026-09-12T02:00:00")).toBe(false);
    expect(() => validateIcecatGeneration("daily", "2026-09-12T02:00:00", "2026-09-10T02:00:00")).toThrow("coverage gap");
    expect(() => validateIcecatGeneration("daily", "2026-09-12T02:00:00", null)).toThrow("coverage gap");
    expect(validateIcecatGeneration("full", "2026-09-12T02:00:00", null)).toBe(true);
  });
  it("only advances the checkpoint after complete parsing and bounded writes; retries keep stable IDs", async () => {
    const calls: { method: string; body: Record<string,unknown> }[] = [];
    const client = createClient<Database>("http://localhost:54321", "test", { global: { fetch: async (url, init) => {
      const method = String(url).split("/").at(-1) ?? "";
      const body: Record<string,unknown> = JSON.parse(String(init?.body));
      calls.push({ method, body });
      return new Response(JSON.stringify(method === "claim_equipment_catalog_sync" ? [{ completed_generation: null }] : null), { status: 200, headers: { "Content-Type": "application/json" } });
    } } });
    const xml = `<files.index Generated="20260912020000">${Array.from({ length: 501 }, (_, i) => file({ Product_ID: String(i + 1) })).join("")}</files.index>`;
    const written = await importIcecatCatalog(options(xml), client);
    expect(written).not.toHaveProperty("statistics");
    expect(calls.map(c => c.method)).toEqual(["claim_equipment_catalog_sync", "import_equipment_catalog_batch", "import_equipment_catalog_batch", "finish_equipment_catalog_sync"]);
    expect(calls[1].body.p_rows).toHaveLength(500);
    expect(calls[2].body.p_rows).toHaveLength(1);
    expect(calls[3].body.p_error).toBeUndefined();
    calls.length = 0;
    await expect(importIcecatCatalog(options(xml.slice(0, -8)), client)).rejects.toThrow();
    expect(calls.at(-1)?.body.p_error).toBeTruthy();
    expect(calls.filter(c => c.method === "finish_equipment_catalog_sync")).toHaveLength(1);
  });
  it("downloads only fixed Open Icecat paths with server credentials and rejects HTTP errors", async () => {
    vi.stubEnv("ICECAT_API_TOKEN", "test-token");
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no", { status: 401 }));
    const read = async () => { for await (const part of downloadIcecatFile("EN/daily.index.xml.gz", AbortSignal.timeout(1000))) void part; };
    await expect(read()).rejects.toThrow("HTTP 401");
    expect(String(fetcher.mock.calls[0][0])).toBe("https://data.icecat.biz/export/freexml/EN/daily.index.xml.gz");
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Api-token")).toBe("test-token");
  });
});
