import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getKyivDateOnly } from "@/lib/validation/project";
import { invalidMovementRange, matchesMovementSearch, movementPeriodBounds, MOVEMENT_PAGE_SIZE, type FinanceMovementFilters } from "@/lib/finance-movement-filters";
import { financeMovementPresentation, type MovementPresentationOptions } from "@/lib/finance-movement-context";
import { getFinanceMovementContexts } from "./finance-movement-context";

export async function getFilteredMovementIds(client: Awaited<ReturnType<typeof createClient>>, studioId: string, page: number, filters: FinanceMovementFilters, presentation?: MovementPresentationOptions, today = getKyivDateOnly()) {
  if (invalidMovementRange(filters)) return { ids: [], total: 0 };
  const bounds = movementPeriodBounds(filters, today);
  const query = () => {
    // The embedded filter matches one entry, while the later detail query retains all transfer legs.
    const relation = filters.history ? client.from("finance_movements") : client.from("finance_current_movements");
    let request = (filters.account || filters.currency
      ? relation.select("id,description,category_id,category,kind,financial_date,created_at,matching_entries:finance_movement_entries!finance_movement_entries_studio_id_movement_id_fkey!inner()", { count: "exact" })
      : relation.select("id,description,category_id,category,kind,financial_date,created_at", { count: "exact" }))
      .eq("studio_id", studioId)
      .order("financial_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (filters.category === "none") request = request.is("category_id", null);
    else if (filters.category) request = request.eq("category_id", filters.category);
    if (filters.kind) request = request.eq("kind", filters.kind);
    if (filters.account) request = request.eq("matching_entries.account_id", filters.account);
    if (filters.currency) request = request.eq("matching_entries.currency", filters.currency);
    if (bounds) request = request.gte("financial_date", bounds[0]).lte("financial_date", bounds[1]);
    return request;
  };
  if (!filters.q) {
    const result = await query().range((page - 1) * MOVEMENT_PAGE_SIZE, page * MOVEMENT_PAGE_SIZE - 1);
    if (result.error) throw new Error("Unable to filter Finance movements.", { cause: result.error });
    return { ids: result.data.flatMap(row => row.id ? [row.id] : []), total: result.count ?? 0 };
  }
  if (!presentation) throw new Error("Movement search requires its display context.");
  // Context spans allocations and localized labels. Scan every candidate on the server in bounded
  // batches until exhausted; never cap matches or search only the visible page.
  const matches: string[] = [];
  // Context embeds these UUIDs twice in its URL; reuse the proven 50-row detail batch
  // to stay below the API gateway's URI limit, without limiting the total search.
  const batchSize = MOVEMENT_PAGE_SIZE;
  for (let offset = 0; ; offset += batchSize) {
    const result = await query().range(offset, offset + batchSize - 1);
    if (result.error) throw new Error("Unable to search Finance movements.", { cause: result.error });
    const ids = result.data.flatMap(row => row.id ? [row.id] : []);
    const contexts = await getFinanceMovementContexts(client, studioId, ids);
    for (const row of result.data) {
      if (!row.id) continue;
      const { title, category, context } = financeMovementPresentation(row, contexts.get(row.id) ?? [], presentation);
      if (matchesMovementSearch(filters.q, [title, category, context, row.description, row.category].filter(Boolean).join(" "), presentation.locale)) matches.push(row.id);
    }
    if (result.data.length < batchSize) break;
  }
  return { ids: matches.slice((page - 1) * MOVEMENT_PAGE_SIZE, page * MOVEMENT_PAGE_SIZE), total: matches.length };
}
