import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({ options: { "allow-remote": { type: "boolean", default: false }, "retry-failed": { type: "boolean", default: false } } });
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !values["allow-remote"]) {
    throw new Error("Remote backfill requires explicit --allow-remote authorization");
  }
  const { backfillMetaLeads } = await import("../src/lib/meta-leads/backfill");
  console.info(await backfillMetaLeads(values["retry-failed"]));
}

main().catch(() => {
  console.error("Meta backfill failed. Check configuration, Graph access and database availability. Already queued leads are safe; rerun to resume.");
  process.exitCode = 1;
});
