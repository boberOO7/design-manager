export type CandidateStatusFilter = "active" | "reserve" | "hired" | "rejected" | "all";
type LeadFilterRecord = {
  client_name: string; company: string | null; email: string | null; phone: string | null;
  request_description: string | null; status: string;
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
