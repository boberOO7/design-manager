import "server-only";
import { resolveForecastAssumptions } from "./finance-forecast";
import type { ForecastFx } from "@/lib/finance-forecast";
import { tripPlanSummary } from "@/lib/finance-trips";
import { projectReferenceValue } from "@/lib/finance-project-plan";
import { getKyivDateOnly } from "@/lib/validation/project";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";

export async function getFinanceTrips(projectId?: string, manualFx: ForecastFx = []) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const query = () => {
    let request = client.from("finance_trip_totals").select("*").eq("studio_id", admin.studio_id).order("starts_on", { ascending: false }).order("id");
    if (projectId) request = request.eq("project_id", projectId);
    return request;
  };
  const first = await query().range(0, 999);
  if (first.error) throw new Error("Unable to load business trips.", { cause: first.error });
  const trips = first.data;
  for (let offset = 1000; trips.length === offset; offset += 1000) {
    const next = await query().range(offset, offset + 999);
    if (next.error) throw new Error("Unable to load business trips.", { cause: next.error });
    trips.push(...next.data);
  }
  const planEntries: Array<Parameters<typeof tripPlanSummary>[0][number] & {trip_id: string | null}> = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await client.from("finance_trip_entry_values").select("id,trip_id,kind,reverses_id,amount::text,currency").eq("studio_id",admin.studio_id).eq("kind","plan").order("id").range(offset,offset+999);
    if (page.error) throw new Error("Unable to load trip plans.",{cause:page.error});
    planEntries.push(...page.data);
    if (page.data.length < 1000) break;
  }
  if (!trips.length) return [];
  const estimates = await estimateTripPlans(planEntries, trips[0].reporting_currency ?? "UAH", manualFx);
  return trips.map(trip => ({...trip,...tripPlanSummary(planEntries.filter(e=>e.trip_id===trip.id),estimates.values,estimates.digits,trip.actual_amount ?? "0")}));
}
export async function getFinanceTripOptions() {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [projects, members] = await Promise.all([
    client.from("projects").select("id,name,status").eq("studio_id", admin.studio_id).order("name"),
    client.from("studio_members").select("user_id,is_active,profile:profiles!studio_members_user_id_fkey(full_name,is_active)").eq("studio_id", admin.studio_id).order("joined_at"),
  ]);
  if (projects.error || members.error) throw new Error("Unable to load trip options.", { cause: projects.error ?? members.error });
  return { projects: projects.data ?? [], members: members.data ?? [] };
}
export async function getFinanceTrip(id: string, manualFx: ForecastFx = []) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [trip, travelers, balances, payments] = await Promise.all([
    client.from("finance_trip_totals").select("*").eq("studio_id", admin.studio_id).eq("id", id).maybeSingle(),
    client.from("finance_trip_travelers").select("*").eq("studio_id", admin.studio_id).eq("trip_id", id).order("employee_name"),
    client.from("finance_trip_balances").select("*,expected:finance_expected_balances!finance_trip_balances_studio_id_expected_item_id_fkey(id,commitment,remaining_amount::text,settled_amount::text)").eq("studio_id", admin.studio_id).eq("trip_id", id),
    client.from("finance_payment_availability").select("id,description,financial_date,currency,original_amount::text,unapplied_amount::text,account_id").eq("studio_id", admin.studio_id).eq("direction", "outgoing").eq("nature", "operating").gt("unapplied_amount", 0).order("financial_date", { ascending: false }).limit(1000),
  ]);
  const query = () => client.from("finance_trip_entry_values").select("id,kind,expense_type,label,amount::text,currency,financial_date,employee_id,movement_id,expected_item_id,plan_id,reverses_id,note,reporting_currency,reporting_amount::text,net_amount::text,net_reporting_amount::text,fx_rate::text,fx_source,fx_effective_date,daily_rate::text,day_count,traveler_count,created_at").eq("studio_id", admin.studio_id).eq("trip_id", id).order("created_at").order("id");
  const first = await query().range(0, 999);
  const error = trip.error ?? travelers.error ?? balances.error ?? payments.error ?? first.error;
  if (error) throw new Error("Unable to load business trip.", { cause: error });
  if (!trip.data) return null;
  const entries = first.data ?? [];
  for (let offset = 1000; entries.length === offset; offset += 1000) {
    const next = await query().range(offset, offset + 999);
    if (next.error) throw new Error("Unable to load trip history.", { cause: next.error });
    entries.push(...next.data);
  }
  const planned = entries.filter(e => e.kind === "plan" && e.expected_item_id);
  const allocations = planned.length ? await client.from("finance_allocations").select("movement_id,expected_item_id").eq("studio_id",admin.studio_id).in("expected_item_id",planned.flatMap(e => e.expected_item_id ? [e.expected_item_id] : [])).gt("amount",0) : null;
  if (allocations?.error) throw new Error("Unable to load planned payments.",{cause:allocations.error});
  const paidPlans = allocations?.data?.length ? await client.from("finance_payment_availability").select("id,description,financial_date,currency,original_amount::text,unapplied_amount::text,account_id").eq("studio_id",admin.studio_id).in("id",allocations.data.map(v => v.movement_id)) : null;
  if (paidPlans?.error) throw new Error("Unable to load planned payments.",{cause:paidPlans.error});
  const candidates = [...(payments.data ?? []),...(paidPlans?.data ?? [])].filter((v,i,all)=>all.findIndex(p=>p.id===v.id)===i).map(v=>({...v,planId:planned.find(p=>allocations?.data?.some(a=>a.expected_item_id===p.expected_item_id && a.movement_id===v.id))?.id ?? null}));
  const estimates = await estimateTripPlans(entries,trip.data.reporting_currency ?? "UAH",manualFx);
  const movementIds = entries.flatMap(e=>e.movement_id ? [e.movement_id] : []);
  const expectedIds = planned.flatMap(e=>e.expected_item_id ? [e.expected_item_id] : []);
  const entryPayments: {movement_id:string;account_id:string}[] = [];
  const planDates: {id:string;expected_payment_date:string|null}[] = [];
  for (let offset=0;offset<Math.max(movementIds.length,expectedIds.length);offset+=500) {
    const [cash,dates] = await Promise.all([
      client.from("finance_movement_entries").select("movement_id,account_id").eq("studio_id",admin.studio_id).eq("entry_role","primary").in("movement_id",movementIds.slice(offset,offset+500)),
      client.from("finance_expected_items").select("id,expected_payment_date").eq("studio_id",admin.studio_id).in("id",expectedIds.slice(offset,offset+500)),
    ]);
    if (cash.error || dates.error) throw new Error("Unable to load trip edit context.",{cause:cash.error ?? dates.error});
    entryPayments.push(...cash.data);planDates.push(...dates.data);
  }
  const coverage = await client.from("finance_trip_entry_travelers").select("entry_id,employee_id").eq("studio_id",admin.studio_id).eq("trip_id",id);
  const calendar = trip.data.calendar_event_id ? await client.from("calendar_events").select("project_id").eq("studio_id",admin.studio_id).eq("id",trip.data.calendar_event_id).maybeSingle() : null;
  if (coverage.error || calendar?.error) throw new Error("Unable to load trip context.",{cause:coverage.error ?? calendar?.error});
  return { trip: {...trip.data,...tripPlanSummary(entries,estimates.values,estimates.digits,trip.data.actual_amount ?? "0")}, estimates, entryPayments, planDates, coverage:coverage.data ?? [], calendar:calendar?.data ?? null, travelers: travelers.data ?? [], entries, balances: balances.data ?? [], payments: candidates };
}
export type FinanceTripData = NonNullable<Awaited<ReturnType<typeof getFinanceTrip>>>;
export type FinanceTripOptions = NonNullable<Awaited<ReturnType<typeof getFinanceTripOptions>>>;

async function estimateTripPlans(entries: Parameters<typeof tripPlanSummary>[0], base: string, manualFx: ForecastFx) {
  const client = await createClient();
  const currencies = await client.from("finance_currencies").select("code,minor_units");
  if (currencies.error) throw new Error("Unable to load currencies.",{cause:currencies.error});
  const digits = currencies.data.find(c=>c.code===base)?.minor_units ?? 2;
  const plans = entries.filter(e=>e.kind==="plan" && !e.reverses_id && !entries.some(r=>r.reverses_id===e.id));
  const needed = [...new Set(plans.flatMap(e=>e.currency && e.currency!==base ? [e.currency] : []))];
  const fx = await resolveForecastAssumptions({asOf:getKyivDateOnly(),currency:base,items:[],issues:[]},manualFx,needed);
  const values: Record<string,string|null> = {};
  for (const entry of plans) {
    if (!entry.id) continue;
    const rate = entry.currency===base ? "1" : fx.find(f=>f.currency===entry.currency)?.rate;
    const units = currencies.data.find(c=>c.code===entry.currency)?.minor_units;
    values[entry.id] = rate && units !== undefined ? projectReferenceValue(entry.amount,rate,units,digits) : null;
  }
  return {values,fx,digits,needed};
}
