"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getFinanceData } from "@/data/queries/finance";
import { createClient } from "@/lib/supabase/server";
import { defaultFinanceReportingSource, resolveFinanceFx } from "@/lib/finance-fx";
import { validateMovementAccounts } from "@/lib/finance-movements";
import { previewFinanceAllocationSplit } from "@/lib/finance-fx-preview";
import { closeRemainderInputSchema, projectSettlementInputSchema, reverseRemainderInputSchema, type ProjectSettlementOptions } from "@/lib/finance-project-settlement";
import { financeAmountUnits, type FinanceActionState } from "@/lib/finance";
import { getKyivDateOnly } from "@/lib/validation/project";

export async function getProjectSettlementOptions(projectId: string, itemId: string): Promise<ProjectSettlementOptions | null> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(itemId).success) return null;
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const selected = await client.from("finance_project_expected_balances").select("*").eq("studio_id", admin.studio_id).eq("project_id", projectId).eq("id", itemId).maybeSingle();
  if (selected.error) throw new Error("Unable to load settlement target.");
  const item = selected.data;
  if (!item?.currency || !item.stream || item.direction !== "incoming" || item.commitment === "cancelled" || !item.remaining_amount || item.remaining_amount <= 0) return null;
  const categories = await client.from("finance_categories").select("id").eq("studio_id", admin.studio_id).eq("direction", "incoming").eq("nature", "operating");
  if (categories.error) throw new Error("Unable to load settlement categories.");
  if (!categories.data.some(category => category.id === item.category_id)) return null;
  const candidates: ProjectSettlementOptions["candidates"] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = client.from("finance_project_expected_balances").select("id,description,remaining_amount::text,version,due_date,expected_payment_date")
      .eq("studio_id", admin.studio_id).eq("project_id", projectId).eq("stream", item.stream).eq("currency", item.currency)
      .eq("direction", "incoming").in("category_id", categories.data.map(category => category.id)).neq("commitment", "cancelled").gt("remaining_amount", 0)
      .order("due_date", { nullsFirst: false }).order("id").range(offset, offset + 999);
    query = item.order_id ? query.eq("order_id", item.order_id) : query.is("order_id", null);
    const page = await query;
    if (page.error) throw new Error("Unable to load settlement schedule.");
    for (const row of page.data) if (row.id && row.version !== null) candidates.push({ id: row.id, title: row.description ?? "", remaining: row.remaining_amount, version: row.version, date: row.due_date });
    if (page.data.length < 1000) break;
  }
  const plans: { terms_id: string; item_order: string[]; terms: { revision: number; stream: string } }[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = client.from("finance_project_plan_revisions").select("terms_id,item_order,terms:finance_project_terms!inner(revision,stream)")
      .eq("studio_id", admin.studio_id).eq("project_id", projectId).eq("terms.stream", item.stream).order("terms_id").range(offset, offset + 999);
    query = item.order_id ? query.eq("terms.order_id", item.order_id) : query.is("terms.order_id", null);
    const page = await query;
    if (page.error) throw new Error("Unable to load settlement order.");
    plans.push(...page.data);
    if (page.data.length < 1000) break;
  }
  const plan = plans.sort((a, b) => b.terms.revision - a.terms.revision)[0];
  const order = new Map((plan?.item_order ?? []).map((id, index) => [id, index]));
  candidates.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    || (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31") || a.id.localeCompare(b.id));
  const selectedIndex = candidates.findIndex(candidate => candidate.id === itemId);
  if (selectedIndex < 0) return null;
  return { orderId: item.order_id, orderName: item.order_name, currency: item.currency, candidates: candidates.slice(selectedIndex), snapshot: { orderId: item.order_id, planRevisionId: plan?.terms_id ?? null, items: candidates.map(candidate => ({ itemId: candidate.id, version: candidate.version, remaining: candidate.remaining })) } };
}

function refreshFinance() {
  revalidatePath("/finance", "layout");
  revalidatePath("/projects/[projectId]", "page");
}

export async function saveProjectSettlement(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.settlement");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const parsed = projectSettlementInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("errors.invalid") };
  const input = parsed.data, client = await createClient();
  // Ambiguous retries succeed before quotes or balances can invalidate their saved snapshot.
  const prior = await client.from("finance_movements").select("request_payload").eq("studio_id", admin.studio_id).eq("request_id", input.requestId).maybeSingle();
  if (prior.error) return { status: "error", message: t("errors.save") };
  if (prior.data) {
    const payload = prior.data.request_payload;
    const saved = payload && typeof payload === "object" && !Array.isArray(payload) ? projectSettlementInputSchema.safeParse(payload.submission) : null;
    if (!saved?.success || JSON.stringify(saved.data) !== JSON.stringify(input)) return { status: "error", message: t("errors.conflict") };
    refreshFinance();
    return { status: "success" };
  }
  const data = await getFinanceData();
  if (!data?.settings?.finalized_at || input.date > getKyivDateOnly() || !validateMovementAccounts(input, data.accounts, data.currencies)) return { status: "error", message: t("errors.invalid") };
  const account = data.accounts.find(row => row.id === input.accountId);
  const selected = await client.from("finance_project_expected_balances").select("currency,category_id").eq("studio_id", admin.studio_id).eq("project_id", input.projectId).eq("id", input.expectedItemId).maybeSingle();
  if (!account || selected.error || !selected.data?.currency) return { status: "error", message: t("errors.invalid") };
  const obligation = data.currencies.find(row => row.code === selected.data?.currency), native = data.currencies.find(row => row.code === account.currency);
  if (!obligation || !native || (account.currency === obligation.code ? input.settlementFx.source !== "identity" || input.settlementFx.rate !== "1" : input.settlementFx.source === "identity")) return { status: "error", message: t("errors.invalid") };
  try {
    previewFinanceAllocationSplit(input.amount, input.settlementFx.rate, input.allocations.map(row => row.amount), native.minor_units, obligation.minor_units);
    for (const row of input.allocations) {
      const snapshot = input.snapshot.items.find(item => item.itemId === row.itemId);
      if (!snapshot || financeAmountUnits(row.amount, obligation.minor_units) > financeAmountUnits(snapshot.remaining, obligation.minor_units)) throw new Error("overallocated");
    }
  } catch (error) { return { status: "error", message: t(error instanceof Error && error.message === "unrepresentable" ? "errors.unrepresentable" : "errors.overallocated") }; }
  if (input.settlementFx.source === "nbu") {
    const current = await resolveFinanceFx(account.currency, obligation.code, input.date, "nbu", "").catch(() => null);
    if (!current || current.rate !== input.settlementFx.rate || current.effectiveDate !== input.settlementFx.effectiveDate) return { status: "error", id: "stalePreview", message: t("errors.stale") };
  }
  const fx = await resolveFinanceFx(account.currency, data.settings.base_currency, input.date, defaultFinanceReportingSource, "").catch(() => null);
  const result = await client.rpc("record_finance_project_payment", {
    p_studio_id: admin.studio_id, p_request_id: input.requestId, p_project_id: input.projectId, p_item_id: input.expectedItemId,
    p_input: { kind: "incoming", nature: "operating", date: input.date, accountId: input.accountId, amount: input.amount, categoryId: input.categoryId, category: input.category, description: input.description, allocationIntent: true, fee: "0", fx, settlementFx: input.settlementFx, submission: input },
    p_allocations: input.allocations.filter(row => Number(row.amount) > 0), p_snapshot: input.snapshot,
  });
  if (result.error) {
    const stale = result.error.message === "finance_settlement_preview_stale";
    return { status: "error", ...(stale ? { id: "stalePreview" } : {}), message: t(stale ? "errors.stale" : result.error.message === "finance_settlement_split_unrepresentable" ? "errors.unrepresentable" : result.error.message === "finance_request_conflict" ? "errors.conflict" : "errors.save") };
  }
  refreshFinance();
  return { status: "success" };
}

export async function saveRemainderAdjustment(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.settlement");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("errors.forbidden") };
  const client = await createClient();
  let result;
  if (form.get("intent") === "reverseClosure") {
    const parsed = reverseRemainderInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success || parsed.data.date > getKyivDateOnly()) return { status: "error", message: t("errors.invalid") };
    const input = parsed.data;
    result = await client.rpc("reverse_finance_settlement_adjustment", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_adjustment_id: input.adjustmentId, p_date: input.date, p_reason: input.reason });
  } else {
    const parsed = closeRemainderInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success || parsed.data.date > getKyivDateOnly()) return { status: "error", message: t("errors.invalid") };
    const input = parsed.data;
    result = await client.rpc("close_finance_expected_remainder", { p_studio_id: admin.studio_id, p_request_id: input.requestId, p_item_id: input.itemId, p_date: input.date, p_reason: input.reason, p_explanation: input.explanation, p_remaining: Number(input.remaining) });
  }
  if (result.error) return { status: "error", message: t(result.error.message === "finance_settlement_preview_stale" ? "errors.staleClosure" : "errors.save") };
  refreshFinance();
  return { status: "success" };
}
