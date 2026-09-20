import "server-only";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { getKyivDateOnly } from "@/lib/validation/project";

export type FinancePlanningPeriod = "month" | "30days" | "3months" | "6months" | "all";

function planningPeriodBounds(period:FinancePlanningPeriod,today:string) {
  if(period==="all") return null;
  const [year,month,day]=today.split("-").map(Number);
  const start=period==="30days"?new Date(Date.UTC(year,month-1,day)):new Date(Date.UTC(year,month-1,1));
  const end=period==="30days"?new Date(Date.UTC(year,month-1,day+29)):new Date(Date.UTC(year,month+(period==="month"?0:period==="3months"?2:5),0));
  return [start.toISOString().slice(0,10),end.toISOString().slice(0,10)] as const;
}

export async function getFinanceData() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const supabase = await createClient();
  const [settings, accounts, currencies, balances, categories] = await Promise.all([
    supabase.from("finance_settings").select("*").eq("studio_id", admin.studio_id).maybeSingle(),
    supabase.from("finance_accounts").select("id,studio_id,name,currency,opening_balance,archived_at,created_at,updated_at,created_by,opening_fx_effective_date,opening_fx_rate::text,opening_fx_source,opening_reporting_amount::text,opening_valued_at,opening_valued_by").eq("studio_id", admin.studio_id).order("created_at").order("id"),
    supabase.from("finance_currencies").select("*").order("code"),
    supabase.from("finance_account_balances").select("id,studio_id,name,currency,opening_balance,archived_at,recorded_balance::text").eq("studio_id", admin.studio_id),
    supabase.from("finance_categories").select("*").eq("studio_id",admin.studio_id).order("created_at").order("name"),
  ]);
  const error = settings.error ?? accounts.error ?? currencies.error ?? balances.error ?? categories.error;
  if (error) throw new Error("Unable to load Finance.", { cause: error });
  return { settings: settings.data, accounts: (accounts.data ?? []).map(account => ({ ...account,
    // PostgREST cast inference drops nullability; validate the nullable wire fields.
    opening_reporting_amount: z.string().nullable().parse(account.opening_reporting_amount),
    opening_fx_rate: z.string().nullable().parse(account.opening_fx_rate),
  })), currencies: currencies.data ?? [], balances: balances.data ?? [], categories:categories.data??[] };
}

export async function getFinanceMovements(page: number) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const { data, error, count } = await client.from("finance_movements")
    .select("*, entries:finance_movement_entries!finance_movement_entries_studio_id_movement_id_fkey(id,studio_id,movement_id,account_id,amount,currency,entry_role,reporting_currency,reporting_amount::text,fx_rate::text,fx_source,fx_effective_date)", { count: "exact" })
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

export async function getFinancePlanning(page:number,creditPage:number,filter:string,projectId?:string,stream="design",period:FinancePlanningPeriod="all",today=getKyivDateOnly(),itemId?:string) {
  const admin=await getActiveStudioAdmin();
  if(!admin) return null;
  const client=await createClient();
  const coverage=await client.rpc("ensure_finance_schedule_occurrences",{p_studio_id:admin.studio_id,p_horizon:"12"});
  if(coverage.error) throw new Error("Unable to maintain Finance schedule coverage.",{ cause:coverage.error });
  let query=projectId
    ? client.from("finance_project_expected_balances").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id).eq("project_id",projectId).eq("stream",stream)
    : client.from("finance_expected_balances").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id);
  if(itemId) query=query.eq("id",itemId);
  if(filter==="receivables" || filter==="obligations") query=query.eq("direction",filter==="receivables" ? "incoming" : "outgoing").gt("outstanding_amount",0);
  if(filter==="incoming" || filter==="outgoing") query=query.eq("direction",filter);
  if(filter==="cancelled") query=query.eq("commitment","cancelled");
  const bounds=planningPeriodBounds(period,today);
  if(bounds) query=query.or(`and(expected_payment_date.gte.${bounds[0]},expected_payment_date.lte.${bounds[1]}),and(expected_payment_date.is.null,due_date.gte.${bounds[0]},due_date.lte.${bounds[1]}),and(expected_payment_date.is.null,due_date.is.null),and(commitment.neq.cancelled,remaining_amount.gt.0,due_state.eq.overdue),and(commitment.neq.cancelled,remaining_amount.gt.0,payment_state.eq.partial)`);
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
  const obligations=ids.length ? await client.from("finance_obligation_items").select("obligation_id,expected_item_id,component,obligation:finance_obligations!finance_obligation_items_studio_id_obligation_id_fkey(kind,employee_name,period_start,period_end)").eq("studio_id",admin.studio_id).in("expected_item_id",ids) : null;
  if(obligations?.error) throw new Error("Unable to load obligation context.",{ cause:obligations.error });
  const obligationIds=[...new Set(obligations?.data?.map((link)=>link.obligation_id)??[])];
  const payrollCosts=obligationIds.length ? await client.from("finance_payroll_unknown_costs").select("*").eq("studio_id",admin.studio_id).in("obligation_id",obligationIds) : null;
  if(payrollCosts?.error) throw new Error("Unable to load payroll cost completion.",{ cause:payrollCosts.error });
  return { payrollCosts:payrollCosts?.data??[],obligations:obligations?.data??[],items:items.data??[],payments:payments.data??[],credits:credits.data??[],history:history?.data??[],links:links?.data??[],total:items.count??0,creditTotal:credits.count??0 };
}
export type FinancePlanningData=NonNullable<Awaited<ReturnType<typeof getFinancePlanning>>>;

export async function getFinanceProject(projectId:string) {
  const admin=await getActiveStudioAdmin();
  if(!admin) return null;
  const client=await createClient();
  const [terms,history,totals,contractors,visits]=await Promise.all([
    client.from("finance_project_current_terms").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId),
    client.from("finance_project_terms").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId).order("created_at",{ ascending:false }).order("id").range(0,999),
    client.from("finance_project_totals").select("studio_id,project_id,stream,currency,contract_amount::text,scheduled_amount::text,collected_amount::text,outstanding_amount::text,planned_amount::text,unscheduled_amount::text").eq("studio_id",admin.studio_id).eq("project_id",projectId),
    client.from("contractors").select("id,name,category:contractor_categories!inner(studio_id)").eq("category.studio_id",admin.studio_id).order("name").limit(1000),
    client.from("calendar_events").select("id,title,starts_at").eq("studio_id",admin.studio_id).eq("project_id",projectId).eq("event_type","site_visit").is("cancelled_at",null).order("starts_at",{ ascending:false }).limit(200),
  ]);
  const error=terms.error??history.error??totals.error??contractors.error??visits.error;
  if(error) throw new Error("Unable to load Project Finance.",{ cause:error });
  // Historical visit defaults must not depend on a recent-revisions limit.
  const termHistory=history.data??[];
  for(let offset=1000;termHistory.length===offset;offset+=1000) {
    const page=await client.from("finance_project_terms").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId).order("created_at",{ ascending:false }).order("id").range(offset,offset+999);
    if(page.error) throw new Error("Unable to load Project Finance.",{ cause:page.error });
    termHistory.push(...page.data);
  }
  // Data API casts preserve decimal text but omit view nullability from inferred types.
  const projectTotals=(totals.data??[]).map(row=>({...row,contract_amount:z.string().nullable().parse(row.contract_amount),unscheduled_amount:z.string().nullable().parse(row.unscheduled_amount)}));
  return { projectId,terms:terms.data??[],termHistory,totals:projectTotals,contractors:contractors.data??[],visits:visits.data??[] };
}
export type FinanceProjectData=NonNullable<Awaited<ReturnType<typeof getFinanceProject>>>;

export async function getFinanceSchedules() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const coverage = await client.rpc("ensure_finance_schedule_occurrences", { p_studio_id: admin.studio_id, p_horizon: "12" });
  if (coverage.error) throw new Error("Unable to maintain Finance schedule coverage.", { cause: coverage.error });
  const [schedules, terms, members] = await Promise.all([
    client.from("finance_schedules").select("*").eq("studio_id", admin.studio_id).order("created_at", { ascending: false }),
    client.from("finance_schedule_history").select("*").eq("studio_id", admin.studio_id).order("revision", { ascending: false }),
    client.from("studio_members").select("user_id,is_active,joined_at,profile:profiles!studio_members_user_id_fkey(full_name,is_active)").eq("studio_id", admin.studio_id).order("joined_at"),
  ]);
  const error = schedules.error ?? terms.error ?? members.error;
  if (error) throw new Error("Unable to load Finance schedules.", { cause: error });
  return { schedules: schedules.data ?? [], terms: terms.data ?? [], members: members.data ?? [] };
}
export type FinanceSchedulesData = NonNullable<Awaited<ReturnType<typeof getFinanceSchedules>>>;
