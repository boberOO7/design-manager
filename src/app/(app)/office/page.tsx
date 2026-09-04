import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardCheck, Clock3, Inbox, LockKeyhole } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getOfficeAssignmentsData } from "@/data/queries/office-assignments";
import { getSubmissionsData } from "@/data/queries/submissions";
import { isOfficeAssignmentOverdue, isTerminalOfficeAssignmentStatus } from "@/lib/office-assignments";
import { isTerminalSubmissionStatus } from "@/lib/submissions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Office");
  return { title: t("title") };
}

function kyivToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function OfficeOverviewPage() {
  const [t, submissionsT, submissions, assignments] = await Promise.all([getTranslations("Office"), getTranslations("Submissions"), getSubmissionsData(), getOfficeAssignmentsData()]);
  const isAdmin = assignments.isAdmin;
  const today = kyivToday();
  const ownSubmissions = submissions.items.filter((item) => item.author?.id === submissions.currentUserId);
  const assignedToMe = assignments.items.filter((item) => item.responsible.id === assignments.currentUserId && !isTerminalOfficeAssignmentStatus(item.status));
  const activeAssignments = assignments.items.filter((item) => !isTerminalOfficeAssignmentStatus(item.status));
  const overdueAssignments = assignments.items.filter((item) => isOfficeAssignmentOverdue(item.deadline, item.status, today));
  const attention = submissions.items.filter((item) => !isTerminalSubmissionStatus(item.type, item.status));
  const recentSubmissions = (isAdmin ? submissions.items : ownSubmissions).map((item) => ({ id: item.id, title: item.title, updatedAt: item.updatedAt, href: `/office/submissions?item=${item.id}`, kind: t("activity.submission"), person: item.isAnonymous ? null : item.author, anonymous: item.isAnonymous }));
  const recentAssignments = assignments.items.map((item) => ({ id: item.id, title: item.title, updatedAt: item.updatedAt, href: `/office/assignments?item=${item.id}`, kind: t("activity.assignment"), person: item.responsible, anonymous: false }));
  const recent = [...recentSubmissions, ...recentAssignments].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const cards = isAdmin ? [
    { label: t("metrics.attention"), value: attention.length, href: "/office/submissions", icon: Inbox },
    { label: t("metrics.active"), value: activeAssignments.length, href: "/office/assignments", icon: ClipboardCheck },
    { label: t("metrics.overdue"), value: overdueAssignments.length, href: "/office/assignments", icon: AlertTriangle },
    { label: t("metrics.assignedToMe"), value: assignedToMe.length, href: "/office/assignments", icon: Clock3 },
  ] : [
    { label: t("metrics.mySubmissions"), value: ownSubmissions.length, href: "/office/submissions", icon: Inbox },
    { label: t("metrics.assignedToMe"), value: assignedToMe.length, href: "/office/assignments", icon: ClipboardCheck },
    { label: t("metrics.overdueMine"), value: overdueAssignments.length, href: "/office/assignments", icon: AlertTriangle },
  ];

  return <div className="space-y-6">
    <div><h2 className="text-lg font-bold text-[var(--ui-text)]">{t("overview.title")}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t(isAdmin ? "overview.adminDescription" : "overview.employeeDescription")}</p></div>
    <section aria-label={t("metrics.label")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, href, icon: Icon }) => <Link key={label} href={href} className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-panel)] transition-colors hover:border-[var(--ui-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="flex items-center justify-between gap-3"><Icon className="size-5 text-[var(--ui-text-muted)]" aria-hidden="true" /><ArrowRight className="size-4 text-[var(--ui-text-subtle)]" aria-hidden="true" /></span><strong className="mt-5 block text-3xl tracking-tight">{value}</strong><span className="mt-1 block text-sm text-[var(--ui-text-secondary)]">{label}</span></Link>)}</section>
    <section className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)]"><div className="border-b border-[var(--ui-border)] px-4 py-3 sm:px-5"><h3 className="font-semibold">{t("activity.title")}</h3><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{t("activity.description")}</p></div>{recent.length ? <div className="divide-y divide-[var(--ui-border-subtle)]">{recent.map((item) => <Link key={`${item.kind}-${item.id}`} href={item.href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:px-5">{item.anonymous ? <span role="img" aria-label={submissionsT("anonymous")} className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]"><LockKeyhole className="size-4" aria-hidden="true" /></span> : item.person ? <UserAvatar imageUrl={item.person.avatarUrl} name={item.person.fullName} size="sm" /> : null}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="block truncate text-xs text-[var(--ui-text-muted)]">{item.kind} · {item.anonymous ? submissionsT("anonymous") : item.person?.fullName}</span></span><ArrowRight className="size-4 shrink-0 text-[var(--ui-text-subtle)]" aria-hidden="true" /></Link>)}</div> : <p className="px-5 py-10 text-center text-sm text-[var(--ui-text-muted)]">{t("activity.empty")}</p>}</section>
  </div>;
}
