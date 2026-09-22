import "server-only";
import { getActiveStudioAdmin } from "./active-studio-admin";
import { createClient } from "@/lib/supabase/server";

export async function getFinanceTrips(projectId?: string) {
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
  return trips;
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
export async function getFinanceTrip(id: string) {
  const admin = await getActiveStudioAdmin();
  if (!admin) return null;
  const client = await createClient();
  const [trip, travelers, balances, payments] = await Promise.all([
    client.from("finance_trip_totals").select("*").eq("studio_id", admin.studio_id).eq("id", id).maybeSingle(),
    client.from("finance_trip_travelers").select("*").eq("studio_id", admin.studio_id).eq("trip_id", id).order("employee_name"),
    client.from("finance_trip_balances").select("*,expected:finance_expected_balances!finance_trip_balances_studio_id_expected_item_id_fkey(id,commitment,remaining_amount::text,settled_amount::text)").eq("studio_id", admin.studio_id).eq("trip_id", id),
    client.from("finance_payment_availability").select("id,description,financial_date,currency,original_amount::text,unapplied_amount::text,account_id").eq("studio_id", admin.studio_id).eq("direction", "outgoing").eq("nature", "operating").gt("unapplied_amount", 0).order("financial_date", { ascending: false }).limit(1000),
  ]);
  const query = () => client.from("finance_trip_entry_values").select("id,kind,expense_type,label,amount::text,currency,financial_date,employee_id,movement_id,expected_item_id,plan_id,reverses_id,note,reporting_currency,reporting_amount::text,net_amount::text,net_reporting_amount::text,fx_rate::text,fx_source,fx_effective_date,daily_rate::text,day_count,created_at").eq("studio_id", admin.studio_id).eq("trip_id", id).order("created_at").order("id");
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
  return { trip: trip.data, travelers: travelers.data ?? [], entries, balances: balances.data ?? [], payments: candidates };
}
export type FinanceTripData = NonNullable<Awaited<ReturnType<typeof getFinanceTrip>>>;
export type FinanceTripOptions = NonNullable<Awaited<ReturnType<typeof getFinanceTripOptions>>>;
