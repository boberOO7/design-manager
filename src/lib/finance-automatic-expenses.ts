import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFinanceFx } from "@/lib/finance-fx";
import { expenseCandidateSchema } from "./finance-expenses";
const valueCandidate = z.object({ action: z.literal("value"), studioId: z.uuid(), sourceId: z.uuid(), currency: z.string(), reportingCurrency: z.string(), to: z.iso.date() });
const pendingSourceCandidate = z.object({ action: z.enum(["earning", "trip"]), studioId: z.uuid(), sourceId: z.uuid(), currency: z.string().nullable(), reportingCurrency: z.string(), to: z.iso.date() });

export async function processAutomaticExpenses(studioId?: string) {
  const client = createAdminClient();
  const response = await client.rpc("prepare_finance_automatic_expenses", studioId ? { p_studio_id: studioId } : {});
  if (response.error) throw new Error("Unable to discover automatic expenses.", { cause: response.error });
  const candidates = z.array(z.discriminatedUnion("action", [expenseCandidateSchema, valueCandidate, pendingSourceCandidate])).parse(response.data);
  const result = { processed: 0, failed: 0 };
  for (const candidate of candidates) {
    try {
      let fx = null;
      try { if (candidate.currency) fx = await resolveFinanceFx(candidate.currency, candidate.reportingCurrency, candidate.to, "nbu", ""); }
      catch { /* Preserve native expense; missing dated FX stays explicit and retryable. */ }
      if (candidate.action === "value" && !fx) { result.failed++; continue; }
      const response = candidate.action === "recognize"
        ? await client.rpc("process_finance_automatic_expense", { p_studio_id: candidate.studioId, p_source_id: candidate.sourceId, p_month: candidate.month, p_digest: candidate.digest, p_fx: fx })
        : candidate.action === "value"
        ? await client.rpc("value_finance_automatic_expense", { p_studio_id: candidate.studioId, p_entry_id: candidate.sourceId, p_fx: fx })
        : await client.rpc("process_finance_pending_source", { p_studio_id: candidate.studioId, p_kind: candidate.action, p_source_id: candidate.sourceId, p_fx: fx });
      if (response.error) throw response.error;
      result.processed++;
    } catch {
      result.failed++;
      console.error("Automatic expense processing failed", { studioId: candidate.studioId, sourceId: candidate.sourceId });
    }
  }
  return result;
}
export function scheduleAutomaticExpenses(studioId: string) {
  after(async () => {
    try { await processAutomaticExpenses(studioId); }
    catch { console.error("Automatic expense maintenance failed", { studioId }); }
  });
}
