import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";
import { z } from "zod";

// Reuse the already-running app and local Supabase. Never use .env.local's target.
const local = z.object({ API_URL: z.url(), PUBLISHABLE_KEY: z.string(), SERVICE_ROLE_KEY: z.string() })
  .parse(JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })));
if (!["localhost", "127.0.0.1"].includes(new URL(local.API_URL).hostname)) throw new Error("Employee profile tests require local Supabase");
process.env.EQUIPMENT_TEST_SUPABASE_URL = local.API_URL;
process.env.EQUIPMENT_TEST_SERVICE_KEY = local.SERVICE_ROLE_KEY;
process.env.EQUIPMENT_TEST_PUBLISHABLE_KEY = local.PUBLISHABLE_KEY;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "employee-profile.spec.ts",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: { baseURL: "http://localhost:3000", viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure", trace: "retain-on-failure" },
});
