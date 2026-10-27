import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

describe.skipIf(process.env.FINANCE_EARNING_DB_TEST !== "1")("Local earning ledger contracts", () => {
  it("checks financial invariants and permissions in an isolated rollback transaction", () => {
    const output = execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-f", "tests/fixtures/finance-earning-milestones.sql"], {
      env: { ...process.env, PGPASSWORD: "postgres", PGCONNECT_TIMEOUT: "3" }, encoding: "utf8", timeout: 30_000,
    });
    expect(output).toContain("PASS: direct milestone writes cannot bypass guarded RPCs");
    expect(output).toContain("PASS: controlled correction preserves event ownership and corrected total");
    expect(output).toContain("PASS: missing FX remains unresolved instead of guessed");
  });
  it("checks missed trip reconciliation and payroll review dependencies without posting fixture history", () => {
    const output = execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-f", "tests/fixtures/finance-source-reconciliation.sql"], {
      env: { ...process.env, PGPASSWORD: "postgres", PGCONNECT_TIMEOUT: "3" }, encoding: "utf8", timeout: 30_000,
    });
    expect(output).toContain("PASS: missed expense replays refunds and reversed refunds exactly once");
    expect(output).toContain("PASS: unrelated recurring amount and timing revisions preserve review");
    expect(output).toContain("PASS: payroll-related source changes invalidate review");
    expect(output).toContain("PASS: employees cannot invoke privileged source reconciliation");
  });
  it("waits for the Finance lock during concurrent processing and succeeds once it is released", async () => {
    const args = ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-Atq"];
    const env = { ...process.env, PGPASSWORD: "postgres", PGCONNECT_TIMEOUT: "3" };
    const locker = spawn("psql", args, { env, stdio: "pipe" });
    const exited = once(locker, "exit");
    const ready = new Promise<void>((resolve, reject) => {
      let output = "";
      locker.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); if (output.includes("finance-lock-held")) resolve(); });
      locker.once("error", reject);
      locker.once("exit", () => reject(new Error("Finance lock connection exited early")));
    });
    // A table lock exercises lock contention without committing fixture data or posting costs.
    locker.stdin.write("begin; lock table public.finance_settings in exclusive mode;\n\\echo finance-lock-held\n");
    const statement = `begin; set local lock_timeout='200ms'; set local role service_role;
      select set_config('request.jwt.claim.role','service_role',true);
      select public.process_finance_pending_source('${randomUUID()}','earning','${randomUUID()}'); rollback;`;
    try {
      await ready;
      expect(() => execFileSync("psql", [...args, "-c", statement], { env, encoding: "utf8", stdio: "pipe", timeout: 5000 })).toThrow(/lock timeout/);
    } finally {
      locker.stdin.end("rollback;\n\\q\n");
      await exited;
    }
    expect(() => execFileSync("psql", [...args, "-c", statement], { env, encoding: "utf8", stdio: "pipe", timeout: 5000 })).not.toThrow();
  });
});
