import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";
import { z } from "zod";

// Browser tests use only the running local Supabase stack, never .env.local's target.
const local = z.object({ API_URL: z.url(), PUBLISHABLE_KEY: z.string(), SERVICE_ROLE_KEY: z.string() }).parse(JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })));
if (!["localhost", "127.0.0.1"].includes(new URL(local.API_URL).hostname)) throw new Error("Equipment UI tests require local Supabase");
process.env.EQUIPMENT_TEST_SUPABASE_URL = local.API_URL;
process.env.EQUIPMENT_TEST_SERVICE_KEY = local.SERVICE_ROLE_KEY;
process.env.EQUIPMENT_TEST_PUBLISHABLE_KEY = local.PUBLISHABLE_KEY;

// Focused checks can reuse an already-running local app without starting/building
// another server. Its Supabase target must match the running local fixture stack.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Browser tests require a local application");

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { actionTimeout: 10_000, baseURL, viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "pnpm build && pnpm start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 180_000,
    env: { NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY, SUPABASE_SECRET_KEY: local.SERVICE_ROLE_KEY },
  },
});
