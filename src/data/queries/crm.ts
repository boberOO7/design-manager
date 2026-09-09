import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type LeadRow = Database["public"]["Tables"]["crm_leads"]["Row"];
type CandidateRow = Database["public"]["Tables"]["crm_candidates"]["Row"];
type CycleRow = Database["public"]["Tables"]["crm_recruiting_cycles"]["Row"];
type LeadHistoryRow = Database["public"]["Tables"]["crm_lead_history"]["Row"];

export type CrmAdmin = { avatar_url: string | null; id: string; name: string };
export type CrmLead = LeadRow & { responsibleAdmin: CrmAdmin | null };
export type CrmLeadHistory = LeadHistoryRow & {
  actor: { full_name: string } | null;
  project: { name: string } | null;
};
export type CrmRecruitingCycle = CycleRow;
export type CrmCandidate = CandidateRow & { responsibleAdmin: CrmAdmin | null; cycles: CrmRecruitingCycle[] };

async function getCrmContext() {
  const membership = await getActiveStudioAdmin();
  if (!membership) return null;
  return { membership, supabase: await createClient() };
}

export async function getCrmAdmins(): Promise<CrmAdmin[]> {
  const context = await getCrmContext();
  if (!context) return [];
  const { data, error } = await context.supabase
    .from("studio_members")
    .select("user_id, profile:profiles!studio_members_user_id_fkey!inner(full_name, avatar_url)")
    .eq("studio_id", context.membership.studio_id)
    .eq("system_role", "admin")
    .eq("is_active", true)
    .order("joined_at");
  if (error) throw new Error("Unable to load CRM administrators.", { cause: error });
  return data.map((row) => ({ avatar_url: row.profile.avatar_url, id: row.user_id, name: row.profile.full_name }));
}

export async function getCrmLeads(): Promise<{ error: boolean; leads: CrmLead[] }> {
  const context = await getCrmContext();
  if (!context) return { error: false, leads: [] };
  const { data, error } = await context.supabase
    .from("crm_leads")
    .select("*")
    .eq("studio_id", context.membership.studio_id)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("Unable to load CRM leads", error);
    return { error: true, leads: [] };
  }
  const admins = await getCrmAdmins();
  const adminNames = new Map(admins.map((admin) => [admin.id, admin]));
  return { error: false, leads: data.map((lead) => ({ ...lead, responsibleAdmin: lead.responsible_admin_id ? adminNames.get(lead.responsible_admin_id) ?? null : null })) };
}

export async function getCrmLeadHistory(leadId: string): Promise<CrmLeadHistory[]> {
  const context = await getCrmContext();
  if (!context) return [];
  const { data, error } = await context.supabase
    .from("crm_lead_history")
    .select("*, actor:profiles!crm_lead_history_actor_id_fkey(full_name), project:projects!crm_lead_history_project_id_fkey(name)")
    .eq("studio_id", context.membership.studio_id)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error("Unable to load CRM lead history.", { cause: error });
  return data;
}

export async function getCrmCandidates(): Promise<{ candidates: CrmCandidate[]; error: boolean }> {
  const context = await getCrmContext();
  if (!context) return { candidates: [], error: false };
  const [candidateResult, cycleResult] = await Promise.all([
    context.supabase
      .from("crm_candidates")
      .select("*")
      .eq("studio_id", context.membership.studio_id)
      .order("updated_at", { ascending: false }),
    context.supabase
      .from("crm_recruiting_cycles")
      .select("*")
      .eq("studio_id", context.membership.studio_id)
      .order("started_at", { ascending: false }),
  ]);
  if (candidateResult.error || cycleResult.error) {
    console.error("Unable to load CRM candidates", candidateResult.error ?? cycleResult.error);
    return { candidates: [], error: true };
  }
  const cyclesByCandidate = new Map<string, CycleRow[]>();
  for (const cycle of cycleResult.data) {
    const cycles = cyclesByCandidate.get(cycle.candidate_id) ?? [];
    cycles.push(cycle);
    cyclesByCandidate.set(cycle.candidate_id, cycles);
  }
  const admins = await getCrmAdmins();
  const adminNames = new Map(admins.map((admin) => [admin.id, admin]));
  return {
    error: false,
    candidates: candidateResult.data.map((candidate) => ({
      ...candidate,
      responsibleAdmin: candidate.responsible_admin_id ? adminNames.get(candidate.responsible_admin_id) ?? null : null,
      cycles: cyclesByCandidate.get(candidate.id) ?? [],
    })),
  };
}
