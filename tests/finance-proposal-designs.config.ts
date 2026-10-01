import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";
import { z } from "zod";

// Reuse the running app and local Supabase; no build or replacement dev server.
const local = z.object({ API_URL: z.url(), SERVICE_ROLE_KEY: z.string() }).parse(JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })));
if (!["localhost", "127.0.0.1"].includes(new URL(local.API_URL).hostname)) throw new Error("Local Supabase required");
process.env.EQUIPMENT_TEST_SUPABASE_URL = local.API_URL;
process.env.EQUIPMENT_TEST_SERVICE_KEY = local.SERVICE_ROLE_KEY;
export default defineConfig({
  testDir: "./e2e", testMatch: "finance-proposal-designs.spec.ts", workers: 1,
  timeout: 180_000, expect: { timeout: 20_000 },
  use: { baseURL: "http://localhost:3000", viewport: { width: 1440, height: 1000 } },
});
