import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { financeAmountUnits } from "@/lib/finance";

async function loadAllocations(client: Awaited<ReturnType<typeof createClient>>, studioId: string, movementIds: string[], offset: number) {
  const result = await client.from("finance_allocations").select(`
    movement_id,cause_movement_id,expected_item_id,amount::text,
    expected:finance_expected_items!finance_allocations_studio_id_expected_item_id_fkey(
      id,description,category_id,
      payroll:finance_obligation_items!finance_obligation_items_studio_id_expected_item_id_fkey(
        component,obligation:finance_obligations!finance_obligation_items_studio_id_obligation_id_fkey(kind,employee_name,period_start)
      ),
      project:finance_project_items!finance_project_items_studio_id_expected_item_id_fkey(
        context_label,project:projects!finance_project_items_project_id_studio_id_fkey(name),
        contractor:contractors!finance_project_items_contractor_id_fkey(name)
      )
    )
  `).eq("studio_id", studioId)
    .or(`movement_id.in.(${movementIds.join(",")}),cause_movement_id.in.(${movementIds.join(",")})`)
    .order("id").range(offset, offset + 999);
  if (result.error) throw new Error("Unable to load Finance movement context.", { cause: result.error });
  return result.data;
}

export type FinanceMovementContext = NonNullable<Awaited<ReturnType<typeof loadAllocations>>[number]["expected"]>;

export async function getFinanceMovementContexts(client: Awaited<ReturnType<typeof createClient>>, studioId: string, movementIds: string[]) {
  const contexts = new Map<string, FinanceMovementContext[]>();
  if (!movementIds.length) return contexts;
  const balances = new Map<string, { movementId: string; amount: bigint; expected: FinanceMovementContext }>();
  const append = (movementId: string, expected: FinanceMovementContext) => {
    const items = contexts.get(movementId) ?? [];
    if (!items.some(item => item.id === expected.id)) items.push(expected);
    contexts.set(movementId, items);
  };
  for (let offset = 0; ; offset += 1000) {
    const rows = await loadAllocations(client, studioId, movementIds, offset);
    for (const row of rows) {
      if (!row.expected) continue;
      const key = `${row.movement_id}:${row.expected_item_id}`;
      const previous = balances.get(key);
      balances.set(key, { movementId: row.movement_id, amount: (previous?.amount ?? BigInt(0)) + financeAmountUnits(row.amount, 4), expected: row.expected });
      // Refund/reversal releases identify the exact sources affected by that event.
      if (row.cause_movement_id && movementIds.includes(row.cause_movement_id)) append(row.cause_movement_id, row.expected);
    }
    if (rows.length < 1000) break;
  }
  for (const balance of balances.values()) {
    if (balance.amount > BigInt(0) && movementIds.includes(balance.movementId)) append(balance.movementId, balance.expected);
  }
  return contexts;
}
