import config from "./statistics.config";

export default { ...config, testMatch: "**/project-actual-dates.spec.ts", use: { ...config.use, actionTimeout: 10_000 } };
