import { defineConfig } from "@playwright/test";

// Static design workspace only: reuse a running dev app, with no database fixtures.
process.env.PROPOSAL_DESIGN_PREVIEW = "1";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "proposal-design-preview.spec.ts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: { baseURL: process.env.PROPOSAL_DESIGN_PREVIEW_URL ?? "http://localhost:3000", viewport: { width: 1440, height: 1000 } },
});
