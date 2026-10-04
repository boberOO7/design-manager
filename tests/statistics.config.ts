import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";
import { z } from "zod";

// Reuse the running app and local Supabase; this config never starts a server.
process.env.SUPABASE_TELEMETRY_DISABLED = "1";
function supabaseStatus() {
  try {
    return execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  }
}
const local = z.object({ API_URL: z.url(), PUBLISHABLE_KEY: z.string(), SERVICE_ROLE_KEY: z.string() }).parse(JSON.parse(supabaseStatus()));
if (!["localhost", "127.0.0.1"].includes(new URL(local.API_URL).hostname)) throw new Error("Statistics browser tests require local Supabase");
process.env.EQUIPMENT_TEST_SUPABASE_URL = local.API_URL;
process.env.EQUIPMENT_TEST_PUBLISHABLE_KEY = local.PUBLISHABLE_KEY;
process.env.EQUIPMENT_TEST_SERVICE_KEY = local.SERVICE_ROLE_KEY;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/statistics.spec.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:3000", viewport: { width: 1440, height: 1000 }, hasTouch: true, screenshot: "only-on-failure", trace: "retain-on-failure" },
});
