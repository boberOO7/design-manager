"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getFinanceData, getFinanceMovementHistory } from "@/data/queries/finance";
import { createClient } from "@/lib/supabase/server";
import { defaultFinanceReportingSource, resolveFinanceFx } from "@/lib/finance-fx";
import { correctionInputSchema, financeRateSchema, movementInputSchema, reversalInputSchema, validateMovementAccounts } from "@/lib/finance-movements";
import { getKyivDateOnly } from "@/lib/validation/project";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceMovement(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.movements");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const client = await createClient();
  let error: { message: string } | null;
  if (form.get("intent") === "reverse") {
    const parsed = reversalInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success || form.get("confirmed") !== "on") return { status: "error", message: t("errors.invalid") };
    const input = parsed.data;
    const original = await client.from("finance_movements").select("financial_date").eq("studio_id", admin.studio_id).eq("id", input.movementId).maybeSingle();
    if (original.error || !original.data) return { status: "error", message: t("errors.save") };
    ({ error } = await client.rpc("reverse_finance_movement", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_movement_id: input.movementId, p_date: original.data.financial_date, p_reason: input.reason }));
  } else {
    const correcting = form.get("intent") === "correct";
    const schema = correcting ? correctionInputSchema : movementInputSchema;
    const parsed = schema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { status: "error", message: t("errors.invalid") };
    const input = parsed.data;
    // Resolve an ambiguous network retry before fetching FX or checking newly archived accounts.
    const prior = await client.from("finance_movements").select("request_payload").eq("studio_id", admin.studio_id).eq("request_id", input.requestId).maybeSingle();
    if (prior.error) return { status: "error", message: t("errors.save") };
    if (prior.data) {
      const payload = prior.data.request_payload;
      const submission = payload && typeof payload === "object" && !Array.isArray(payload) ? schema.safeParse(payload.submission) : null;
      const priorCorrection = payload && typeof payload === "object" && !Array.isArray(payload) && payload.submission && typeof payload.submission === "object" && !Array.isArray(payload.submission) && "movementId" in payload.submission;
      if (Boolean(priorCorrection) !== correcting || !submission?.success || JSON.stringify(submission.data) !== JSON.stringify(input)) return { status: "error", message: t("errors.conflict") };
      revalidatePath("/finance", "layout");
      revalidatePath("/projects/[projectId]", "page");
      return { status: "success", message: t("saved") };
    }
    const data = await getFinanceData();
    if (!data?.settings?.finalized_at) return { status: "error", message: t("errors.setup") };
    if (input.date > getKyivDateOnly() || !validateMovementAccounts(input, data.accounts, data.currencies)) return { status: "error", message: t("errors.invalid") };
    const account = data.accounts.find((item) => item.id === input.accountId);
    const destination = data.accounts.find((item) => item.id === input.destinationId);
    if (!account) return { status: "error", message: t("errors.invalid") };
    let fx; let destinationFx; let settlementFx;
    if (input.expectedItemId && input.autoAllocate) {
      const expected = await client.from("finance_expected_balances").select("currency,remaining_amount").eq("studio_id", admin.studio_id).eq("id", input.expectedItemId).maybeSingle();
      if (expected.error || !expected.data?.currency || !expected.data.remaining_amount || expected.data.remaining_amount <= 0) return { status: "error", message: t("errors.invalid") };
      if (account.currency !== expected.data.currency) {
        try { settlementFx = await resolveFinanceFx(account.currency, expected.data.currency, input.date, input.settlementFxMode, input.settlementManualRate); }
        catch { return { status: "error", message: t("errors.fx") }; }
      }
    }
    // Cash is authoritative in account currency; a missing reporting quote must
    // never prevent posting. Resolve each transfer leg independently.
    [fx, destinationFx] = await Promise.all([
      resolveFinanceFx(account.currency, data.settings.base_currency, input.date, defaultFinanceReportingSource, "").catch(() => null),
      input.kind === "transfer" && destination && account.currency !== destination.currency
        ? resolveFinanceFx(destination.currency, data.settings.base_currency, input.date, defaultFinanceReportingSource, "").catch(() => null)
        : Promise.resolve(null),
    ]);
    if (input.kind === "transfer" && destination?.currency === account.currency) destinationFx = fx;
    const payload = {
      kind: input.kind, nature: input.nature, date: input.date, accountId: input.accountId, amount: input.amount,
      category: input.category, categoryId:input.categoryId, description: input.description, allocationIntent:input.allocationIntent, fee: input.fee, fx, settlementFx, submission: input,
      ...(input.kind === "transfer" ? { destinationId: input.destinationId, receivedAmount: input.receivedAmount, destinationFx } : {}),
      ...(input.kind === "refund" ? { relatedMovementId: input.relatedMovementId } : {}),
    };
    ({ error } = "movementId" in input && typeof input.movementId === "string"
      ? await client.rpc("correct_finance_movement", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_movement_id: input.movementId, p_input: payload })
      : input.expectedItemId
      ? await client.rpc("record_finance_expected_payment",{ p_studio_id:admin.studio_id,p_request_id:input.requestId,p_item_id:input.expectedItemId,p_input:payload,...(input.autoAllocate?{}:{p_allocation_amount:Number(input.allocationAmount)}) })
      : await client.rpc("record_finance_movement", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_input:payload }));
  }
  if (error) {
    const message = error.message === "finance_request_conflict" ? "errors.conflict"
      : error.message === "finance_already_reversed" ? "errors.reversed"
      : error.message === "finance_reverse_refunds_first" ? form.get("intent") === "correct" ? "errors.correctionRefunds" : "errors.refundsFirst"
      : error.message === "finance_refund_exceeds_original" ? "errors.refundAmount"
      : ["finance_trip_edit_unavailable", "finance_trip_payment_invalid", "finance_trip_closed", "finance_trip_traveler_invalid"].includes(error.message) ? "errors.tripCorrection"
      : error.message === "finance_opening_unavailable" ? "errors.opening"
      : error.message === "finance_account_unavailable" ? "errors.archived" : "errors.save";
    return { status: "error", message: t(message) };
  }
  revalidatePath("/finance", "layout");
  revalidatePath("/projects/[projectId]", "page");
  return { status: "success", message: t("saved") };
}

export async function loadFinanceMovementHistory(id: string) {
  try { return { movements: await getFinanceMovementHistory(id), error: false }; }
  catch { return { movements: [], error: true }; }
}

export async function valueFinanceMovement(_previous: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.movements");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const parsed = z.object({ movementId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/), rate: financeRateSchema }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const client = await createClient();
  const { data, error } = await client.from("finance_movements").select("financial_date,kind,related_movement_id")
    .eq("studio_id", admin.studio_id).eq("id", parsed.data.movementId).maybeSingle();
  if (error || !data || data.kind === "reversal") return { status: "error", message: t("errors.save") };
  const result = await client.rpc("value_finance_movement", {
    p_studio_id: admin.studio_id, p_movement_id: parsed.data.movementId, p_currency: parsed.data.currency,
    p_fx: { rate: parsed.data.rate, source: "manual", effectiveDate: data.financial_date },
  });
  if (result.error) return { status: "error", message: t("errors.save") };
  revalidatePath("/finance", "layout");
  revalidatePath("/projects/[projectId]", "page");
  revalidatePath("/dashboard");
  return { status: "success", message: t("saved") };
}

const quoteSchema = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), obligationCurrency: z.string().regex(/^[A-Z]{3}$/), date: z.iso.date() });
type QuoteInput = z.infer<typeof quoteSchema>;

async function datedFinanceQuote(input: QuoteInput, today: string) {
  const date = input.date > today ? today : input.date;
  try { return { ...await resolveFinanceFx(input.currency, input.obligationCurrency, date, "nbu", ""), indicative: input.date > today }; }
  catch { return null; }
}

export async function quoteFinanceSettlement(input: QuoteInput) {
  const admin = await getActiveStudioAdmin();
  const parsed = quoteSchema.safeParse(input);
  if (!admin || !parsed.success) return null;
  return datedFinanceQuote(parsed.data, getKyivDateOnly());
}

export async function quoteFinanceSchedule(inputs: QuoteInput[]) {
  const admin = await getActiveStudioAdmin();
  const parsed = z.array(quoteSchema).safeParse(inputs);
  if (!admin || !parsed.success) return [];
  const today = getKyivDateOnly();
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof resolveFinanceFx>> | null>>();
  return Promise.all(parsed.data.map(async (input) => {
    const date = input.date > today ? today : input.date;
    const key = `${input.currency}:${input.obligationCurrency}:${date}`;
    let quote = cache.get(key);
    if (!quote) {
      quote = resolveFinanceFx(input.currency, input.obligationCurrency, date, "nbu", "").catch(() => null);
      cache.set(key, quote);
    }
    const value = await quote;
    return value ? { ...value, indicative: input.date > today } : null;
  }));
}
