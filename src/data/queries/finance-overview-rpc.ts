import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export async function requestFinanceOverviewAfterRefresh(
  client: Awaited<ReturnType<typeof createClient>>,
  args: Database["public"]["Functions"]["get_finance_overview_after_refresh"]["Args"],
) {
  return requestOverviewRpc(client, "get_finance_overview_after_refresh", args);
}

export async function prepareFinanceOverviewFxContext(
  client: Awaited<ReturnType<typeof createClient>>,
  args: Database["public"]["Functions"]["prepare_finance_overview_fx_context"]["Args"],
) {
  return requestOverviewRpc(client, "prepare_finance_overview_fx_context", args);
}

async function requestOverviewRpc(
  client: Awaited<ReturnType<typeof createClient>>,
  name: "get_finance_overview_after_refresh" | "prepare_finance_overview_fx_context",
  args: Database["public"]["Functions"]["get_finance_overview_after_refresh"]["Args"],
) {
  const request = async (attempt: number) => {
    const started = performance.now();
    const response = await client.rpc(name, args);
    if (response.error) console.warn("Finance Overview RPC failed.", {
      attempt,
      status: response.status,
      code: response.error.code,
      message: response.error.message,
      details: response.error.details,
      hint: response.error.hint,
      durationMs: Math.round(performance.now() - started),
    });
    return response;
  };

  let response = await request(1);
  // Preparation reconciles the same occurrences; reporting retries are read-only.
  // POST RPCs are not retried by the SDK. Give a resetting upstream time to
  // recover, but never retry a PostgreSQL/PostgREST error or invalid JSON.
  for (const [index, delay] of [500, 1000, 2000].entries()) {
    const retryable = response.error && !response.error.code && (
      [502, 503, 504].includes(response.status) ||
      (response.status === 0 && /^TypeError: (fetch failed|terminated)$/.test(response.error.message) &&
        /\b(ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT)\b/.test(response.error.details))
    );
    if (!retryable) return response;
    await new Promise(resolve => setTimeout(resolve, delay));
    response = await request(index + 2);
  }
  return response;
}
