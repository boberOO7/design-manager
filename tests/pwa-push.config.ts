import { defineConfig } from "@playwright/test";
import localConfig from "./employee-profile.config";

// Requires a running LOCAL app with VAPID + CRON_SECRET configured. No web server
// or mock Push service is started by this suite.
export default defineConfig({ ...localConfig, testMatch: "pwa-push.spec.ts", timeout: 60_000,
  use: { ...localConfig.use, headless: process.env.PUSH_TEST_HEADED !== "1" },
});
