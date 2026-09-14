import { addCalendarDays, instantToWallInput, zonedWallTimeToIso } from "@/lib/calendar";

export type CandidateStatusFilter = "active" | "reserve" | "hired" | "rejected" | "all";
export type CrmFollowUpQuickChoice = "today" | "tomorrow" | "after_lunch";
type LeadFilterRecord = {
  client_name: string; company: string | null; email: string | null; phone: string | null;
  request_description: string | null; status: string;
};
type LeadAttentionRecord = {
  next_contact_at: string | null;
  responsible_admin_id: string | null;
  status: string;
};
type CandidateFilterRecord = {
  full_name: string; email: string | null; phone: string | null; source: string | null;
  cycles: Array<{ outcome: string | null; target_position: string }>;
};

export function isCandidateStatusFilter(value: string): value is CandidateStatusFilter {
  return ["active", "reserve", "hired", "rejected", "all"].includes(value);
}

export function filterLeads<T extends LeadFilterRecord>(leads: T[], query: string, status: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return leads.filter((lead) => {
    if (status !== "all" && lead.status !== status) return false;
    if (!needle) return true;
    return [lead.client_name, lead.company, lead.email, lead.phone, lead.request_description]
      .some((value) => value?.toLocaleLowerCase().includes(needle));
  });
}

export function resolveCrmFollowUpAt(date: string, time: string): string | null {
  return date ? zonedWallTimeToIso(`${date}T${time || "09:00"}`) : null;
}

export function getCrmFollowUpFormValues(value: string | null): { date: string; time: string } {
  const wall = value ? instantToWallInput(value) : "";
  return { date: wall.slice(0, 10), time: wall.slice(11, 16) || "09:00" };
}

export function getCrmFollowUpQuickChoice(choice: CrmFollowUpQuickChoice, now = new Date()): { date: string; time: string } {
  const wall = instantToWallInput(now.toISOString());
  const today = wall.slice(0, 10);
  if (choice === "tomorrow") return { date: addCalendarDays(today, 1), time: "09:00" };
  if (choice === "after_lunch") return { date: wall.slice(11, 16) < "15:00" ? today : addCalendarDays(today, 1), time: "15:00" };

  const [hour, minute] = wall.slice(11, 16).split(":").map(Number);
  const nextMinute = Math.ceil((hour * 60 + minute + 30) / 5) * 5;
  return nextMinute >= 24 * 60
    ? { date: addCalendarDays(today, 1), time: `${String(Math.floor((nextMinute - 24 * 60) / 60)).padStart(2, "0")}:${String(nextMinute % 60).padStart(2, "0")}` }
    : { date: today, time: `${String(Math.floor(nextMinute / 60)).padStart(2, "0")}:${String(nextMinute % 60).padStart(2, "0")}` };
}

export function isCrmFollowUpOverdue(value: string | null, now = Date.now()): boolean {
  return value !== null && new Date(value).getTime() < now;
}

export const CRM_INACTIVE_FOLLOW_UP_LEAD_STATUS = "invalid";

export function filterCrmLeadsNeedingAttention<T extends LeadAttentionRecord>(leads: T[], currentUserId: string | null, now = Date.now()): T[] {
  if (!currentUserId) return [];
  return leads.filter((lead) => lead.responsible_admin_id === currentUserId
    && lead.status !== CRM_INACTIVE_FOLLOW_UP_LEAD_STATUS
    && isCrmFollowUpOverdue(lead.next_contact_at, now));
}

export function filterCandidates<T extends CandidateFilterRecord>(candidates: T[], query: string, status: CandidateStatusFilter, position: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return candidates.filter((candidate) => {
    const current = candidate.cycles[0];
    if (position && current?.target_position !== position) return false;
    if (status === "active" && (!current || current.outcome !== null)) return false;
    if (status !== "active" && status !== "all" && current?.outcome !== status) return false;
    if (!needle) return true;
    return [candidate.full_name, candidate.email, candidate.phone, candidate.source, current?.target_position]
      .some((value) => value?.toLocaleLowerCase().includes(needle));
  });
}
