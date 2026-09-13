import { createReadStream } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { createAdminClient } from "../src/lib/supabase/admin-client";
import { importIcecatCatalog } from "../src/lib/equipment-catalog/sync";
import { formatCatalogError } from "../src/lib/equipment-catalog/diagnostics";

async function* localFile(path: string) {
  for await (const chunk of createReadStream(path)) {
    const bytes: unknown = chunk;
    if (!(bytes instanceof Uint8Array)) throw new Error("Expected file bytes");
    yield bytes;
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    mode: { type: "string", default: "full" }, index: { type: "string" }, suppliers: { type: "string" }, categories: { type: "string" },
    write: { type: "boolean", default: false }, "allow-remote": { type: "boolean", default: false },
  } });
  const mode = z.enum(["full", "daily"]).parse(values.mode);
  if (!values.index || !values.suppliers || !values.categories) throw new Error("Usage: pnpm catalog:import --index <XML[.gz]> --suppliers <XML[.gz]> --categories <XML[.gz]> [--mode full|daily] [--write] [--allow-remote]");
  if (values.write) {
    const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) && !values["allow-remote"]) throw new Error("Remote writes require explicit --allow-remote authorization");
  }
  console.dir(await importIcecatCatalog({ mode, index: localFile(values.index), suppliers: localFile(values.suppliers), categories: localFile(values.categories) }, values.write ? createAdminClient() : undefined), { depth: null, maxArrayLength: 20, maxStringLength: 500 });
}
main().catch((error: unknown) => {
  console.error(formatCatalogError(error));
  console.error("Catalog import failed. See the diagnostic above.");
  process.exitCode = 1;
});
