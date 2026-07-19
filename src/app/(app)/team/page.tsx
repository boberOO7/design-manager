import { PageHeader } from "@/components/shared/page-header";
import { getTeamData } from "@/data/queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team | StudioFlow",
};

export default function TeamPage() {
  const teamMembers = getTeamData();

  return (
    <div className="space-y-6">
      <PageHeader title="Team" description="Studio directory with public productivity context for active employees." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teamMembers.map((member) => (
          <div key={member.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="font-semibold text-stone-900">{member.full_name}</p>
            <p className="mt-1 text-sm text-stone-500">{member.job_title}</p>
            <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
              <p>Active projects: 1–2</p>
              <p>Current workload: 120–460 m²</p>
              <p>Public productivity: visible to the team</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
