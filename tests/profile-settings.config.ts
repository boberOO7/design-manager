import { defineConfig } from "@playwright/test";
import employeeProfileConfig from "./employee-profile.config";

// Focused profile settings checks reuse the running app and local Supabase.
export default defineConfig({ ...employeeProfileConfig, testMatch: "profile-shell.spec.ts", use: { ...employeeProfileConfig.use, actionTimeout: 10_000 } });
