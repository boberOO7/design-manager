import "server-only";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";

export async function getFinanceData() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const supabase = await createClient();
  const [settings, accounts, currencies, balances] = await Promise.all([
    supabase.from("finance_settings").select("*").eq("studio_id", admin.studio_id).maybeSingle(),
    supabase.from("finance_accounts").select("*").eq("studio_id", admin.studio_id).order("created_at").order("id"),
    supabase.from("finance_currencies").select("*").order("code"),
    supabase.from("finance_account_balances").select("*").eq("studio_id", admin.studio_id),
  ]);
  const error = settings.error ?? accounts.error ?? currencies.error ?? balances.error;
  if (error) throw new Error("Unable to load Finance.", { cause: error });
  return { settings: settings.data, accounts: accounts.data ?? [], currencies: currencies.data ?? [], balances: balances.data ?? [] };
}

export async function getFinanceMovements(page: number) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const { data, error, count } = await client.from("finance_movements")
    .select("*, entries:finance_movement_entries!finance_movement_entries_studio_id_movement_id_fkey(*)", { count: "exact" })
    .eq("studio_id", admin.studio_id).order("financial_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((page-1)*50, page*50-1);
  if (error) throw new Error("Unable to load Finance movements.", { cause: error });
  // Query reverse links explicitly: PostgREST cannot embed this composite self-reference.
  const movements = data ?? [];
  const reversals = movements.length ? await client.from("finance_movements")
    .select("related_movement_id").eq("studio_id", admin.studio_id).eq("kind", "reversal")
    .in("related_movement_id", movements.map((movement) => movement.id)) : null;
  if (reversals?.error) throw new Error("Unable to load Finance reversals.", { cause: reversals.error });
  const reversedIds = new Set(reversals?.data?.map((movement) => movement.related_movement_id));
  return { movements: movements.map((movement) => ({ ...movement, reversed: reversedIds.has(movement.id) })), total: count ?? 0 };
}
export type FinanceMovementWithEntries = NonNullable<Awaited<ReturnType<typeof getFinanceMovements>>>["movements"][number];
