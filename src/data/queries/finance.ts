import "server-only";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";

export async function getFinanceData() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const supabase = await createClient();
  const [settings, accounts, currencies, balances, categories] = await Promise.all([
    supabase.from("finance_settings").select("*").eq("studio_id", admin.studio_id).maybeSingle(),
    supabase.from("finance_accounts").select("*").eq("studio_id", admin.studio_id).order("created_at").order("id"),
    supabase.from("finance_currencies").select("*").order("code"),
    supabase.from("finance_account_balances").select("*").eq("studio_id", admin.studio_id),
    supabase.from("finance_categories").select("*").eq("studio_id",admin.studio_id).order("created_at").order("name"),
  ]);
  const error = settings.error ?? accounts.error ?? currencies.error ?? balances.error ?? categories.error;
  if (error) throw new Error("Unable to load Finance.", { cause: error });
  return { settings: settings.data, accounts: accounts.data ?? [], currencies: currencies.data ?? [], balances: balances.data ?? [], categories:categories.data??[] };
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

export async function getFinanceExpectedItem(id:string) {
  const admin=await getActiveStudioAdmin();
  if(!admin) return null;
  const client=await createClient();
  const { data,error }=await client.from("finance_expected_balances").select("*").eq("studio_id",admin.studio_id).eq("id",id).maybeSingle();
  if(error) throw new Error("Unable to load expected item.",{ cause:error });
  return data;
}

export async function getFinancePlanning(page:number,creditPage:number,filter:string) {
  const admin=await getActiveStudioAdmin();
  if(!admin) return null;
  const client=await createClient();
  let query=client.from("finance_expected_balances").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id);
  if(filter==="receivables" || filter==="obligations") query=query.eq("direction",filter==="receivables" ? "incoming" : "outgoing").gt("outstanding_amount",0);
  if(filter==="incoming" || filter==="outgoing") query=query.eq("direction",filter);
  if(filter==="cancelled") query=query.eq("commitment","cancelled");
  const [items,payments]=await Promise.all([
    query.order("due_date",{ nullsFirst:false }).order("id").range((page-1)*50,page*50-1),
    client.from("finance_payment_availability").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id).gt("unapplied_amount",0)
      .order("financial_date",{ ascending:false }).order("id").range((creditPage-1)*50,creditPage*50-1),
  ]);
  if(items.error || payments.error) throw new Error("Unable to load Finance planning.",{ cause:items.error??payments.error });
  const ids=(items.data??[]).flatMap((item) => item.id ? [item.id] : []);
  const history=ids.length ? await client.from("finance_allocations").select("*, movement:finance_movements!finance_allocations_studio_id_movement_id_fkey(financial_date,category)")
    .eq("studio_id",admin.studio_id).in("expected_item_id",ids).order("created_at",{ ascending:false }).limit(500) : null;
  if(history?.error) throw new Error("Unable to load settlement history.",{ cause:history.error });
  return { items:items.data??[],payments:payments.data??[],history:history?.data??[],total:items.count??0,creditTotal:payments.count??0 };
}
export type FinancePlanningData=NonNullable<Awaited<ReturnType<typeof getFinancePlanning>>>;
