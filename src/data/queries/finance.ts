import "server-only";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { getKyivDateOnly } from "@/lib/validation/project";
import { FINANCE_OVERDUE_DB_FILTER } from "@/lib/finance-planning";

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

export async function getFinanceCategories() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [settings, categories] = await Promise.all([
    client.from("finance_settings").select("studio_id").eq("studio_id", admin.studio_id).maybeSingle(),
    client.rpc("get_finance_category_management", { p_studio_id: admin.studio_id }),
  ]);
  if (settings.error || categories.error) throw new Error("Unable to load Finance categories.", { cause: settings.error ?? categories.error });
  return { ready: Boolean(settings.data), categories: categories.data ?? [] };
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
  if (data) return `/projects/${data.project_id}?view=finance&stream=${data.stream}`;
  const trip = await client.from("finance_trip_balances").select("trip_id").eq("studio_id",admin.studio_id).eq("expected_item_id",id).maybeSingle();
  if (trip.error) throw new Error("Unable to load trip payment context.",{cause:trip.error});
  if (trip.data) return `/finance/trips/${trip.data.trip_id}`;
  const entry = await client.from("finance_trip_entries").select("trip_id").eq("studio_id",admin.studio_id).eq("expected_item_id",id).maybeSingle();
  if (entry.error) throw new Error("Unable to load trip payment context.",{cause:entry.error});
  if (entry.data) return `/finance/trips/${entry.data.trip_id}`;
  return `/finance/expected?item=${id}`;
}

export async function getFinancePlanning(page:number,creditPage:number,filter:string,projectId?:string,stream="design",period:FinancePlanningPeriod="all",today=getKyivDateOnly(),itemId?:string,attention?:"overdue") {
  const admin=await getActiveStudioAdmin();
  if(!admin) return null;
  const client=await createClient();
  const coverage=await client.rpc("ensure_finance_schedule_occurrences",{p_studio_id:admin.studio_id,p_horizon:"12"});
  if(coverage.error) throw new Error("Unable to maintain Finance schedule coverage.",{ cause:coverage.error });
  let query=projectId
    ? client.from("finance_project_expected_balances").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id).eq("project_id",projectId).eq("stream",stream)
    : client.from("finance_expected_balances").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id);
  if(filter==="receivables" || filter==="obligations") query=query.eq("direction",filter==="receivables" ? "incoming" : "outgoing").gt("outstanding_amount",0);
  if(filter==="incoming" || filter==="outgoing") query=query.eq("direction",filter);
  if(filter==="cancelled") query=query.eq("commitment","cancelled");
  if(attention==="overdue") query=query.or(FINANCE_OVERDUE_DB_FILTER);
  const bounds=planningPeriodBounds(period,today);
  if(bounds) query=query.or(`and(expected_payment_date.gte.${bounds[0]},expected_payment_date.lte.${bounds[1]}),and(expected_payment_date.is.null,due_date.gte.${bounds[0]},due_date.lte.${bounds[1]}),and(expected_payment_date.is.null,due_date.is.null),and(commitment.neq.cancelled,remaining_amount.gt.0,due_state.eq.overdue),and(commitment.neq.cancelled,remaining_amount.gt.0,payment_state.eq.partial)`);
  const [items,payments,credits,selected]=await Promise.all([
    query.order("due_date",{ nullsFirst:false }).order("id").range((page-1)*50,page*50-1),
    client.from("finance_payment_availability").select("*").eq("studio_id",admin.studio_id).gt("unapplied_amount",0)
      .order("financial_date",{ ascending:false }).order("id").limit(1000),
    client.from("finance_actionable_unapplied").select("*",{ count:"exact" }).eq("studio_id",admin.studio_id)
      .order("financial_date",{ ascending:false }).order("id").range((creditPage-1)*50,creditPage*50-1),
    itemId&&!projectId?client.from("finance_expected_balances").select("*").eq("studio_id",admin.studio_id).eq("id",itemId).maybeSingle():Promise.resolve(null),
  ]);
  if(items.error || payments.error || credits.error || selected?.error) throw new Error("Unable to load Finance planning.",{ cause:items.error??payments.error??credits.error??selected?.error });
  const visibleItems=selected?.data&&!items.data?.some((item)=>item.id===selected.data?.id)?[selected.data,...(items.data??[])]:items.data??[];
  const ids=visibleItems.flatMap((item) => item.id ? [item.id] : []);
  const history=ids.length ? await client.from("finance_allocations").select("*, movement:finance_movements!finance_allocations_studio_id_movement_id_fkey(financial_date,category)")
    .eq("studio_id",admin.studio_id).in("expected_item_id",ids).order("created_at",{ ascending:false }).limit(500) : null;
  if(history?.error) throw new Error("Unable to load settlement history.",{ cause:history.error });
  const links=ids.length ? await client.from("finance_project_items").select("*,project:projects!finance_project_items_project_id_studio_id_fkey(name)").eq("studio_id",admin.studio_id).in("expected_item_id",ids) : null;
  if(links?.error) throw new Error("Unable to load project payment context.",{ cause:links.error });
  const obligations=ids.length ? await client.from("finance_obligation_items").select("obligation_id,expected_item_id,component,obligation:finance_obligations!finance_obligation_items_studio_id_obligation_id_fkey(kind,employee_name,period_start,period_end)").eq("studio_id",admin.studio_id).in("expected_item_id",ids) : null;
  if(obligations?.error) throw new Error("Unable to load obligation context.",{ cause:obligations.error });
  const obligationIds=[...new Set(obligations?.data?.map((link)=>link.obligation_id)??[])];
  const payrollCosts=obligationIds.length ? await client.from("finance_payroll_unknown_costs").select("*").eq("studio_id",admin.studio_id).in("obligation_id",obligationIds) : null;
  if(payrollCosts?.error) throw new Error("Unable to load payroll cost completion.",{ cause:payrollCosts.error });
  const tripBalances = ids.length ? await client.from("finance_trip_balances").select("trip_id,expected_item_id").eq("studio_id",admin.studio_id).in("expected_item_id",ids) : null;
  const tripEntries = ids.length ? await client.from("finance_trip_entries").select("trip_id,expected_item_id,movement_id").eq("studio_id",admin.studio_id).in("expected_item_id",ids) : null;
  if (tripBalances?.error || tripEntries?.error) throw new Error("Unable to load trip context.",{cause:tripBalances?.error ?? tripEntries?.error});
  return { tripLinks:[...(tripBalances?.data??[]).map(v=>({...v,cash:false})),...(tripEntries?.data??[]).map(v=>({...v,cash:Boolean(v.movement_id)}))],payrollCosts:payrollCosts?.data??[],obligations:obligations?.data??[],items:visibleItems,payments:payments.data??[],credits:credits.data??[],history:history?.data??[],links:links?.data??[],total:items.count??0,creditTotal:credits.count??0 };
}
export type FinancePlanningData=NonNullable<Awaited<ReturnType<typeof getFinancePlanning>>>;

export async function getFinanceProject(projectId:string) {
  const admin=await getActiveStudioAdmin();
  if(!admin) return null;
  const client=await createClient();
  const nextQuery = () => client.from("finance_project_expected_balances").select("id,description,currency,remaining_amount::text,due_date,expected_payment_date").eq("studio_id",admin.studio_id).eq("project_id",projectId).eq("stream","design").eq("commitment","agreed").gt("remaining_amount",0);
  const [terms,history,totals,contractors,visits,nextExpected,nextDue,area,designHistory]=await Promise.all([
    client.from("finance_project_current_terms").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId),
    client.from("finance_project_terms").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId).order("created_at",{ ascending:false }).order("id").range(0,999),
    client.from("finance_project_totals").select("studio_id,project_id,stream,currency,contract_amount::text,scheduled_amount::text,collected_amount::text,outstanding_amount::text,planned_amount::text,unscheduled_amount::text").eq("studio_id",admin.studio_id).eq("project_id",projectId),
    client.from("contractors").select("id,name,category:contractor_categories!inner(studio_id)").eq("category.studio_id",admin.studio_id).order("name").limit(1000),
    client.from("calendar_events").select("id,title,starts_at").eq("studio_id",admin.studio_id).eq("project_id",projectId).eq("event_type","site_visit").is("cancelled_at",null).order("starts_at",{ ascending:false }).limit(200),
    nextQuery().gte("expected_payment_date",getKyivDateOnly()).order("expected_payment_date").order("id").limit(1),
    nextQuery().is("expected_payment_date",null).gte("due_date",getKyivDateOnly()).order("due_date").order("id").limit(1),
    client.from("projects").select("total_area_m2").eq("studio_id",admin.studio_id).eq("id",projectId).single(),
    client.from("finance_project_items").select("expected_item_id").eq("studio_id",admin.studio_id).eq("project_id",projectId).eq("stream","design").limit(1),
  ]);
  const error=terms.error??history.error??totals.error??contractors.error??visits.error??nextExpected.error??nextDue.error??area.error??designHistory.error;
  if(error) throw new Error("Unable to load Project Finance.",{ cause:error });
  // Historical visit defaults must not depend on a recent-revisions limit.
  const termHistory=history.data??[];
  for(let offset=1000;termHistory.length===offset;offset+=1000) {
    const page=await client.from("finance_project_terms").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId).order("created_at",{ ascending:false }).order("id").range(offset,offset+999);
    if(page.error) throw new Error("Unable to load Project Finance.",{ cause:page.error });
    termHistory.push(...page.data);
  }
  const planRevisions = await client.from("finance_project_plan_revisions").select("*").eq("studio_id",admin.studio_id).eq("project_id",projectId).in("terms_id",termHistory.filter(v=>v.stream==="design").slice(0,50).map(v=>v.id));
  if(planRevisions.error) throw new Error("Unable to load pricing revisions.",{cause:planRevisions.error});
  const planQuery = () => client.from("finance_project_plan_items").select("id,version,amount::text,currency,description,due_date,expected_payment_date,has_settlement_history,settled_amount::text").eq("studio_id",admin.studio_id).eq("project_id",projectId).order("id");
  const firstPlanPage = await planQuery().range(0,999);
  if(firstPlanPage.error) throw new Error("Unable to load project payment schedule.",{cause:firstPlanPage.error});
  const planItems=firstPlanPage.data;
  for(let offset=1000;planItems.length===offset;offset+=1000) {
    const next=await planQuery().range(offset,offset+999);
    if(next.error) throw new Error("Unable to load project payment schedule.",{cause:next.error});
    planItems.push(...next.data);
  }
  // Data API casts preserve decimal text but omit view nullability from inferred types.
  const projectTotals=(totals.data??[]).map(row=>({...row,contract_amount:z.string().nullable().parse(row.contract_amount),unscheduled_amount:z.string().nullable().parse(row.unscheduled_amount)}));
  const nextPayment = [...(nextExpected.data??[]),...(nextDue.data??[])].sort((a,b)=>(a.expected_payment_date??a.due_date??"").localeCompare(b.expected_payment_date??b.due_date??""))[0] ?? null;
  return { projectId,nextPayment,hasDesignHistory:Boolean(designHistory.data?.length),area:area.data?.total_area_m2??null,planItems,planRevisions:planRevisions.data,terms:terms.data??[],termHistory,totals:projectTotals,contractors:contractors.data??[],visits:visits.data??[] };
}
export type FinanceProjectData=NonNullable<Awaited<ReturnType<typeof getFinanceProject>>>;

export async function getFinanceSchedules() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const coverage = await client.rpc("ensure_finance_schedule_occurrences", { p_studio_id: admin.studio_id, p_horizon: "12" });
  if (coverage.error) throw new Error("Unable to maintain Finance schedule coverage.", { cause: coverage.error });
  const [schedules, terms, members, groups] = await Promise.all([
    client.from("finance_schedules").select("*").eq("studio_id", admin.studio_id).order("created_at", { ascending: false }),
    client.from("finance_schedule_history").select("*, obligations:finance_obligations!finance_obligations_studio_id_terms_id_schedule_id_fkey(items:finance_obligation_items!finance_obligation_items_studio_id_obligation_id_fkey(expected:finance_expected_balances!finance_obligation_items_studio_id_expected_item_id_fkey(id,expected_payment_date,due_date,remaining_amount,commitment)))").eq("studio_id", admin.studio_id).eq("obligations.kind", "recurring").order("revision", { ascending: false }),
    client.from("studio_members").select("user_id,is_active,joined_at,profile:profiles!studio_members_user_id_fkey(full_name,is_active)").eq("studio_id", admin.studio_id).order("joined_at"),
    client.from("finance_recurring_groups").select("*").eq("studio_id", admin.studio_id).order("position").order("id"),
  ]);
  const error = schedules.error ?? terms.error ?? members.error ?? groups.error;
  if (error) throw new Error("Unable to load Finance schedules.", { cause: error });
  const today = getKyivDateOnly();
  return { groups: groups.data ?? [], schedules: (schedules.data ?? []).map((schedule) => ({ ...schedule,
    nextPayment: (terms.data ?? []).filter((term) => term.schedule_id === schedule.id).flatMap((term) => term.obligations).flatMap((obligation) => obligation.items.flatMap(({ expected }) => {
      const date = expected?.expected_payment_date ?? expected?.due_date;
      return expected?.id && date && date >= today && expected.commitment !== "cancelled" && Number(expected.remaining_amount) > 0
        ? [{ id: expected.id, date }] : [];
    })).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
  })), terms: (terms.data ?? []).map(({ obligations, ...term }) => { void obligations; return term; }), members: members.data ?? [] };
}
export type FinanceSchedulesData = NonNullable<Awaited<ReturnType<typeof getFinanceSchedules>>>;
