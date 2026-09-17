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

export async function getFinanceExpectedReturnHref(id:string) {
  const admin=await getActiveStudioAdmin();
  if(!admin) return "/finance/expected";
  const client=await createClient();
  const { data,error }=await client.from("finance_project_items").select("project_id,stream").eq("studio_id",admin.studio_id).eq("expected_item_id",id).maybeSingle();
  if(error) throw new Error("Unable to load payment context.",{ cause:error });
  return data?`/projects/${data.project_id}?view=finance&stream=${data.stream}`:"/finance/expected";
}

export async function getFinancePlanning(page:number,creditPage:number,filter:string,projectId?:string,stream="design") {
  const admin=await getActiveStudioAdmin();
  if(!admin) return null;
  const client=await createClient();
  let query=projectId
    ? client.from("finance_project_expected_balances").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id).eq("project_id",projectId).eq("stream",stream)
    : client.from("finance_expected_balances").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id);
  if(filter==="receivables" || filter==="obligations") query=query.eq("direction",filter==="receivables" ? "incoming" : "outgoing").gt("outstanding_amount",0);
  if(filter==="incoming" || filter==="outgoing") query=query.eq("direction",filter);
  if(filter==="cancelled") query=query.eq("commitment","cancelled");
  const [items,payments,credits]=await Promise.all([
    query.order("due_date",{ nullsFirst:false }).order("id").range((page-1)*50,page*50-1),
    client.from("finance_payment_availability").select("*").eq("studio_id",admin.studio_id).gt("unapplied_amount",0)
      .order("financial_date",{ ascending:false }).order("id").limit(1000),
    client.from("finance_actionable_unapplied").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id)
      .order("financial_date",{ ascending:false }).order("id").range((creditPage-1)*50,creditPage*50-1),
  ]);
  if(items.error || payments.error || credits.error) throw new Error("Unable to load Finance planning.",{ cause:items.error??payments.error??credits.error });
  const ids=(items.data??[]).flatMap((item) => item.id ? [item.id] : []);
  const history=ids.length ? await client.from("finance_allocations").select("*, movement:finance_movements!finance_allocations_studio_id_movement_id_fkey(financial_date,category)")
    .eq("studio_id",admin.studio_id).in("expected_item_id",ids).order("created_at",{ ascending:false }).limit(500) : null;
  if(history?.error) throw new Error("Unable to load settlement history.",{ cause:history.error });
  const links=ids.length ? await client.from("finance_project_items").select("*").eq("studio_id",admin.studio_id).in("expected_item_id",ids) : null;
  if(links?.error) throw new Error("Unable to load project payment context.",{ cause:links.error });
  const obligations=ids.length ? await client.from("finance_obligation_items").select("expected_item_id,component,obligation:finance_obligations!finance_obligation_items_studio_id_obligation_id_fkey(kind,employee_name,period_start,period_end)").eq("studio_id",admin.studio_id).in("expected_item_id",ids) : null;
  if(obligations?.error) throw new Error("Unable to load obligation context.",{ cause:obligations.error });
  return { obligations:obligations?.data??[],items:items.data??[],payments:payments.data??[],credits:credits.data??[],history:history?.data??[],links:links?.data??[],total:items.count??0,creditTotal:credits.count??0 };
}
export type FinancePlanningData=NonNullable<Awaited<ReturnType<typeof getFinancePlanning>>>;

export async function getFinanceProject(projectId:string) {
  const admin=await getActiveStudioAdmin();
  if(!admin) return null;
  const client=await createClient();
  const [terms,history,totals,contractors,visits]=await Promise.all([
    client.from("finance_project_current_terms").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId),
    client.from("finance_project_terms").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId).order("created_at",{ ascending:false }).order("id").limit(50),
    client.from("finance_project_totals").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId),
    client.from("contractors").select("id,name,category:contractor_categories!inner(studio_id)").eq("category.studio_id",admin.studio_id).order("name").limit(1000),
    client.from("calendar_events").select("id,title,starts_at").eq("studio_id",admin.studio_id).eq("project_id",projectId).eq("event_type","site_visit").is("cancelled_at",null).order("starts_at",{ ascending:false }).limit(200),
  ]);
  const error=terms.error??history.error??totals.error??contractors.error??visits.error;
  if(error) throw new Error("Unable to load Project Finance.",{ cause:error });
  return { projectId,terms:terms.data??[],termHistory:history.data??[],totals:totals.data??[],contractors:contractors.data??[],visits:visits.data??[] };
}
export type FinanceProjectData=NonNullable<Awaited<ReturnType<typeof getFinanceProject>>>;

export async function getFinanceSchedules() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [schedules, terms, members] = await Promise.all([
    client.from("finance_schedules").select("*").eq("studio_id", admin.studio_id).order("created_at", { ascending: false }),
    client.from("finance_schedule_history").select("*").eq("studio_id", admin.studio_id).order("revision", { ascending: false }),
    client.from("studio_members").select("user_id,is_active,profile:profiles!studio_members_user_id_fkey(full_name,is_active)").eq("studio_id", admin.studio_id).order("joined_at"),
  ]);
  const error = schedules.error ?? terms.error ?? members.error;
  if (error) throw new Error("Unable to load Finance schedules.", { cause: error });
  return { schedules: schedules.data ?? [], terms: terms.data ?? [], members: members.data ?? [] };
}
export type FinanceSchedulesData = NonNullable<Awaited<ReturnType<typeof getFinanceSchedules>>>;
