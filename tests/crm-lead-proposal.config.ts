import config from "./meta-leads.config";

// Exercise the existing local app; never start or reconfigure a dev server.
export default { ...config, testMatch: "crm-lead-proposal.spec.ts", use: { ...config.use, actionTimeout: 10_000 } };
