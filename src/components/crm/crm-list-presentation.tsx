"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, Bookmark, CalendarCheck2, CalendarClock, CircleCheck, CircleDashed, CircleDot, CircleSlash, ClipboardList, FileText, Megaphone, MessagesSquare, Plus, Search, Scale, UserRoundSearch, UsersRound, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import actionFeedback from "@/components/ui/primary-action-feedback.module.css";
import type { CrmLead, CrmRecruitingCycle } from "@/data/queries/crm";
import { isCandidateStatusFilter, type CandidateStatusFilter } from "@/lib/crm";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import { getCrmLeadStatusBadgeStyle } from "@/lib/semantic-styles";
import { CRM_LEAD_STATUSES } from "@/lib/validation/crm";
import type { ProfessionalRole } from "@/lib/validation/employee-invitation";
import { cn } from "@/lib/utils";

export type CrmSection = "leads" | "candidates";

// The fallback and loaded workspace render the same static controls and geometry.
export function CrmAddButton({ section, onClick }: { section: CrmSection; onClick?: () => void }) {
  const t = useTranslations("Crm");
  return <Button type="button" disabled={!onClick} className={`${actionFeedback.primary} w-full gap-2 disabled:opacity-100 sm:w-auto`} onClick={onClick}><Plus className="size-4" aria-hidden="true" />{t(`${section}.add`)}</Button>;
}

type SearchProps = { query?: string; onQueryChange?: (value: string) => void; loading?: boolean };

function CrmSearch({ section, query = "", onQueryChange, loading }: SearchProps & { section: CrmSection }) {
  const t = useTranslations("Crm");
  return <label className="relative w-full min-w-0 md:w-96"><span className="sr-only">{t("search")}</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" aria-hidden="true" /><Input className="h-10 pl-9 disabled:opacity-100 disabled:bg-[var(--ui-surface)]" type="search" disabled={loading} value={query} onChange={(event) => onQueryChange?.(event.target.value)} placeholder={t(`${section}.searchPlaceholder`)} /></label>;
}

export function LeadsToolbar({ query, onQueryChange, loading = false, status = "all", onStatusChange, attentionOnly = false, attentionCount = 0, onAttentionChange }: SearchProps & { status?: string; onStatusChange?: (value: string) => void; attentionOnly?: boolean; attentionCount?: number; onAttentionChange?: () => void }) {
  const t = useTranslations("Crm");
  return <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] p-4 md:flex-row md:flex-wrap md:items-center">
    <CrmSearch section="leads" query={query} onQueryChange={onQueryChange} loading={loading} />
    <Button type="button" variant="ghost" aria-pressed={attentionOnly} disabled={loading || attentionCount === 0} onClick={onAttentionChange} className={cn("gap-2", attentionOnly && "bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)]")}><AlertCircle className="size-4" aria-hidden="true" />{t("filters.needsAttention", { count: loading ? "—" : attentionCount })}</Button>
    <Select aria-label={t("statusFilter")} value={status} onValueChange={onStatusChange} disabled={loading} className="md:w-60 disabled:opacity-100 disabled:bg-[var(--ui-surface)]"><SelectItem value="all">{t("filters.all")}</SelectItem>{CRM_LEAD_STATUSES.map((value) => <SelectItem key={value} value={value} textValue={t(`leadStatus.${value}`)}><LeadStatusLabel status={value} label={t(`leadStatus.${value}`)} /></SelectItem>)}</Select>
    <Button asChild variant="ghost" className="gap-2 text-[var(--ui-info-text)] md:ml-auto"><Link href="/crm/leads/meta"><Megaphone className="size-4" aria-hidden="true" />{t("meta.title")}</Link></Button>
  </div>;
}

export function CandidatesToolbar({ query, onQueryChange, loading = false, status = "active", onStatusChange, position = "", onPositionChange, positions }: SearchProps & { status?: CandidateStatusFilter; onStatusChange?: (value: CandidateStatusFilter) => void; position?: string; onPositionChange?: (value: string) => void; positions: readonly ProfessionalRole[] }) {
  const t = useTranslations("Crm");
  const roles = useTranslations("Roles");
  return <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] p-4 md:flex-row md:flex-wrap md:items-center">
    <CrmSearch section="candidates" query={query} onQueryChange={onQueryChange} loading={loading} />
    <Select aria-label={t("statusFilter")} value={status} onValueChange={(value) => { if (isCandidateStatusFilter(value)) onStatusChange?.(value); }} disabled={loading} className="md:w-64 md:shrink-0 disabled:opacity-100 disabled:bg-[var(--ui-surface)]">{(["active", "reserve", "hired", "rejected", "all"] as const).map((value) => <SelectItem key={value} value={value} textValue={t(`filters.${value}`)}><CandidateStatusLabel status={value} label={t(`filters.${value}`)} /></SelectItem>)}</Select>
    <Select aria-label={t("positionFilter")} value={position} onValueChange={onPositionChange} disabled={loading} placeholder={t("filters.allPositions")} className="md:w-60 md:shrink-0 disabled:opacity-100 disabled:bg-[var(--ui-surface)]"><SelectItem value="">{t("filters.allPositions")}</SelectItem>{positions.map((value) => { const key = getCanonicalRoleTranslationKey(value); return <SelectItem key={value} value={value}>{key ? roles(key) : value}</SelectItem>; })}</Select>
  </div>;
}

function LeadsTableHead() {
  const t = useTranslations("Crm");
  return <thead role="rowgroup" className="sr-only border-b border-[var(--ui-border)] text-xs text-[var(--ui-text-muted)] lg:not-sr-only lg:table-header-group"><tr role="row"><th scope="col" className="px-4 py-3 font-medium lg:w-[24%]">{t("leads.columns.contact")}</th><th scope="col" className="px-4 py-3 font-medium">{t("leads.columns.request")}</th><th scope="col" className="px-4 py-3 font-medium lg:w-[21%]">{t("leads.columns.status")} / {t("leads.columns.responsible")}</th><th scope="col" className="px-4 py-3 font-medium lg:w-[26%]">{t("leads.columns.followUp")}</th><th scope="col" className="px-4 py-3 text-right lg:w-16 xl:w-48"><span className="sr-only">{t("recordActions")}</span></th></tr></thead>;
}

function CandidatesTableHead() {
  const t = useTranslations("Crm");
  return <thead role="rowgroup" className="sr-only border-b border-[var(--ui-border)] text-xs text-[var(--ui-text-muted)] lg:not-sr-only lg:table-header-group"><tr role="row"><th scope="col" className="px-4 py-3 font-medium lg:w-[26%]">{t("candidates.columns.name")}</th><th scope="col" className="px-4 py-3 font-medium lg:w-[23%]">{t("candidates.columns.position")}</th><th scope="col" className="px-4 py-3 font-medium lg:w-[29%]">{t("candidates.columns.stage")} / {t("candidates.columns.responsible")}</th><th scope="col" className="px-4 py-3 font-medium">{t("candidates.columns.nextContact")}</th></tr></thead>;
}

export function CrmTableHead({ section }: { section: CrmSection }) {
  return section === "leads" ? <LeadsTableHead /> : <CandidatesTableHead />;
}

type CandidateStatus = CandidateStatusFilter | CrmRecruitingCycle["stage"] | NonNullable<CrmRecruitingCycle["outcome"]>;

const candidateStatusPresentation: Record<CandidateStatus, { Icon: LucideIcon; color: string }> = {
  all: { Icon: UsersRound, color: "text-[var(--ui-text-muted)]" },
  active: { Icon: UserRoundSearch, color: "text-[var(--ui-info-text)]" },
  new: { Icon: CircleDashed, color: "text-[var(--ui-text-muted)]" },
  interview_scheduled: { Icon: CalendarClock, color: "text-[var(--ui-info-text)]" },
  interview_completed: { Icon: CalendarCheck2, color: "text-[var(--ui-info-text)]" },
  test_task: { Icon: ClipboardList, color: "text-[var(--ui-warning-text)]" },
  decision: { Icon: Scale, color: "text-[var(--ui-violet-text)]" },
  reserve: { Icon: Bookmark, color: "text-[var(--ui-warning-text)]" },
  hired: { Icon: CircleCheck, color: "text-[var(--ui-success-text)]" },
  rejected: { Icon: XCircle, color: "text-[var(--ui-danger-text)]" },
};

export function CandidateStatusLabel({ label, status }: { label: string; status: CandidateStatus }) {
  const { Icon, color } = candidateStatusPresentation[status];
  return <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium leading-5 text-[var(--ui-text-secondary)]"><Icon className={`size-3.5 shrink-0 ${color}`} aria-hidden="true" /><span>{label}</span></span>;
}

const leadStatusIcons: Record<CrmLead["status"], LucideIcon> = {
  new: CircleDashed,
  contacted: CircleDot,
  discussion: MessagesSquare,
  proposal: FileText,
  won: CircleCheck,
  lost: XCircle,
  invalid: CircleSlash,
};

export function LeadStatusLabel({ label, status }: { label: string; status: CrmLead["status"] }) {
  const style = getCrmLeadStatusBadgeStyle(status);
  const Icon = leadStatusIcons[status];
  return <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium leading-5 text-[var(--ui-text-secondary)]"><Icon className={cn("size-3.5 shrink-0", style.className, "border-0 bg-transparent")} aria-hidden="true" /><span>{label}</span></span>;
}

