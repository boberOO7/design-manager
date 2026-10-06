import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationDatabase } from "@/types/application-database";
import { getFinanceMovementContexts } from "./finance-movement-context";

vi.mock("server-only", () => ({}));

const source = (id: string) => ({ id, description: id, category_id: "category", payroll: null, project: null });

function clientFor(pages: unknown[][]) {
  const urls: URL[] = [];
  const client = createClient<ApplicationDatabase>("http://127.0.0.1:54321", "test", {
    auth: { persistSession: false },
    global: { fetch: async input => {
      urls.push(new URL(String(input)));
      return new Response(JSON.stringify(pages[urls.length - 1] ?? []));
    } },
  });
  return { client, urls };
}

describe("movement source context", () => {
  it("retains partial matches, excludes released matches and associates refund releases with their source", async () => {
    const row = (expected: string, amount: string, cause: string | null = null) => ({ movement_id: "payment", cause_movement_id: cause, expected_item_id: expected, amount, expected: source(expected) });
    const { client, urls } = clientFor([[row("released", "10.0000"), row("released", "-10.0000"), row("partial", "10.0000"), row("partial", "-3.0000", "refund")]]);
    const context = await getFinanceMovementContexts(client, "verified-studio", ["payment", "refund"]);
    expect(context.get("payment")).toEqual([source("partial")]);
    expect(context.get("refund")).toEqual([source("partial")]);
    expect(urls[0].searchParams.get("studio_id")).toBe("eq.verified-studio");
    expect(urls[0].searchParams.get("or")).toBe("(movement_id.in.(payment,refund),cause_movement_id.in.(payment,refund))");
  });

  it("reads releases beyond the first API page and sums fractional amounts exactly", async () => {
    const row = { movement_id: "payment", cause_movement_id: null, expected_item_id: "source", amount: "0.0001", expected: source("source") };
    const { client, urls } = clientFor([Array.from({ length: 1000 }, () => row), [{ ...row, amount: "-0.1000" }]]);
    expect((await getFinanceMovementContexts(client, "studio", ["payment"])).size).toBe(0);
    expect(urls).toHaveLength(2);
    expect(urls[1].searchParams.get("offset")).toBe("1000");
  });

  it("does not query the ledger for an empty page", async () => {
    const { client, urls } = clientFor([]);
    expect((await getFinanceMovementContexts(client, "studio", [])).size).toBe(0);
    expect(urls).toHaveLength(0);
  });
});
