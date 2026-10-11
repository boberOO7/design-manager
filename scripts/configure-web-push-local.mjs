import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";

// Local-only operator setup. Existing secrets never enter command arguments,
// stdout, migrations, trigger definitions or cron commands.
const env = { ...parseEnv(readFileSync(".env.local", "utf8")), ...process.env };
const supabase = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const callback = new URL(env.WEB_PUSH_DISPATCH_URL ?? "");
const localHost = /^(localhost|127\.0\.0\.1|host\.docker\.internal|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;
if (!["localhost", "127.0.0.1"].includes(supabase.hostname) ||
    !localHost.test(callback.hostname) || callback.protocol !== "http:" || callback.pathname !== "/api/push/dispatch" ||
    callback.search || callback.hash || callback.username || callback.password || !env.CRON_SECRET) {
  throw new Error("Local Supabase, a local HTTP dispatch URL and existing CRON_SECRET are required.");
}
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const sql = `set standard_conforming_strings = on;
select private.configure_web_push_dispatch(${literal(callback.href)}, ${literal(env.CRON_SECRET)});`;
try {
  execFileSync("docker", ["exec", "-i", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"],
    { input: sql, stdio: ["pipe", "ignore", "pipe"] });
} catch {
  throw new Error("Local Push dispatch setup failed. Check local Supabase and apply the event-driven migration first.");
}
console.log("Local Web Push URL and existing dispatch credential saved in encrypted Vault.");
