import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export async function requestFinanceOverview(
  client: Awaited<ReturnType<typeof createClient>>,
  args: Database["public"]["Functions"]["get_finance_overview"]["Args"],
) {
  const request = async (attempt: number) => {
    const started = performance.now();
    const response = await client.rpc("get_finance_overview", args);
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

  const response = await request(1);
  // This RPC and its forecast calculation are read-only. POST RPCs are not
  // retried by the SDK. Never retry a PostgreSQL/PostgREST error or invalid JSON.
  const retryable = response.error && !response.error.code && (
    [502, 503, 504].includes(response.status) ||
    (response.status === 0 && /^TypeError: (fetch failed|terminated)$/.test(response.error.message) &&
      /\b(ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT)\b/.test(response.error.details))
  );
  if (!retryable) return response;
  await new Promise(resolve => setTimeout(resolve, 150));
  return request(2);
}
