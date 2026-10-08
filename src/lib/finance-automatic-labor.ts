import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFinanceFx } from "@/lib/finance-fx";

export const automaticLaborCandidateSchema = z.object({
  studioId: z.uuid(), obligationId: z.uuid(), digest: z.string(), currency: z.string().nullable(), reportingCurrency: z.string(), periodEnd: z.iso.date(), valuationDate: z.iso.date(),
  fx: z.object({ rate: z.string(), source: z.string(), effectiveDate: z.iso.date() }).nullable(),
});

// Changed source digests are the durable pending work. The existing daily cron
// pattern retries outages, while after() only accelerates normal mutations/reads.
export async function processAutomaticLabor(studioId?: string) {
  const client = createAdminClient();
  const response = await client.rpc("prepare_finance_automatic_labor", studioId ? { p_studio_id: studioId } : {});
  if (response.error) throw new Error("Unable to discover automatic labor periods.", { cause: response.error });
  const candidates = z.array(automaticLaborCandidateSchema).parse(response.data);
  const result = { processed: 0, failed: 0 };
  for (const candidate of candidates) {
    try {
      let fx = candidate.fx;
      if (!fx && candidate.currency) {
        try { fx = await resolveFinanceFx(candidate.currency, candidate.reportingCurrency, candidate.valuationDate, "nbu", ""); }
        catch { /* Native payroll remains recognized; missing historical FX is disclosed and retried. */ }
      }
      const response = await client.rpc("process_finance_automatic_labor", {
        p_studio_id: candidate.studioId, p_obligation_id: candidate.obligationId, p_digest: candidate.digest, p_fx: fx,
      });
      if (response.error) throw response.error;
      result.processed++;
    } catch {
      result.failed++;
      // Do not log salary/source payloads. The digest remains discoverable.
      console.error("Automatic labor processing failed", { studioId: candidate.studioId, obligationId: candidate.obligationId });
    }
  }
  return result;
}

export function scheduleAutomaticLabor(studioId: string) {
  after(async () => {
    try { await processAutomaticLabor(studioId); }
    catch { console.error("Automatic labor maintenance failed", { studioId }); }
  });
}
