import Link from "next/link";
import { ArrowLeft, ArrowUpRight, MapPin, CalendarDays, Flag, FolderKanban, ListTodo, Check, LockKeyhole, Activity, Sparkle } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ProfileAvatarEditor } from "@/components/layout/profile-avatar-editor";
import { EmployeeProfileNotes } from "@/components/team/employee-profile-notes";
import { EmployeeProfileHeatmap } from "@/components/team/employee-profile-heatmap";
import { EmployeeProfilePreviewLink } from "@/components/team/employee-profile-preview-link";
import { getEmployeeProfile } from "@/data/queries/employee-profile";
import { getCurrentUserProfile } from "@/data/queries";
import { getCompletedTenureMonths } from "@/lib/employee-profile";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import { getProjectLifecycleBadgeStyle } from "@/lib/semantic-styles";
import { getLocalizedCityName } from "@/lib/city-provider";
import { getCountryName, isCountryCode } from "@/lib/countries";
import { APPLICATION_TIME_ZONE } from "@/lib/calendar";
import { defaultLocale, isAppLocale } from "@/i18n/config";

export async function generateMetadata() {
  const t = await getTranslations("EmployeeProfile");
  return { title: t("title") };
}

export default async function EmployeeProfilePage({ params, searchParams }: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) notFound();
  const [data, t, roles, team, locale, statuses, query] = await Promise.all([
    getEmployeeProfile(userId), getTranslations("EmployeeProfile"), getTranslations("Roles"),
    getTranslations("Team"), getLocale(), getTranslations("Status"), searchParams,
  ]);
  if (!data) notFound();
  const { person, isOwn, isAdmin, work, activity, projects, employment, earliestParticipation, firstCompletedProject } = data;
  const isColleague = !isOwn && !isAdmin;
  const showNotes = isAdmin && query.view === "notes";
  const profile = person.profile;
  const ownProfile = isOwn ? await getCurrentUserProfile() : null;
  const appLocale = isAppLocale(locale) ? locale : defaultLocale;
  const city = await getLocalizedCityName({ city: profile.city, geonamesId: profile.city_geonames_id, locale: appLocale });
  const location = [city, isCountryCode(profile.country_code) ? getCountryName(profile.country_code, appLocale) : null].filter(Boolean).join(", ");
  const jobTitleKey = getCanonicalRoleTranslationKey(profile.job_title);
  const tenure = getCompletedTenureMonths(person.joined_at);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const month = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: APPLICATION_TIME_ZONE });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: APPLICATION_TIME_ZONE });
  const dateOnly = (value: string) => date.format(new Date(value));
  const maximumArea = Math.max(0, ...(work?.history.map((entry) => entry.areaM2) ?? [])) || 1;
  const profileHref = `/team/${userId}`;
  const headingClass = "text-lg font-semibold tracking-tight text-[var(--ui-text)]";
  const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";
  const milestones = [
    ...(person.joined_at ? [{ key: "joined", date: person.joined_at, title: t("joinedStudio"), detail: t("journeyJoinedDescription"), href: null, icon: Flag }] : []),
    ...(earliestParticipation ? [{ key: "participation", date: earliestParticipation.assignedAt, title: isColleague ? t("sharedParticipation") : t("firstProject"), detail: earliestParticipation.name, href: `/projects/${earliestParticipation.id}`, icon: FolderKanban }] : []),
    ...(firstCompletedProject?.completed_at ? [{ key: "completed", date: firstCompletedProject.completed_at, title: t("firstCompletedProject"), detail: firstCompletedProject.name, href: `/projects/${firstCompletedProject.id}`, icon: Check }] : []),
  ].sort((left, right) => left.date.localeCompare(right.date));

  const journey = milestones.length ? <section aria-labelledby="profile-milestones-heading" className="@container/journey min-w-0">
    <h2 id="profile-milestones-heading" className={headingClass}>{t("studioJourney")}</h2>
    <div className="mt-4 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface)] px-5 py-5 sm:px-6">
      <ol className={`grid ${milestones.length > 1 ? `@[36rem]/journey:gap-6 ${milestones.length === 2 ? "@[36rem]/journey:grid-cols-2" : "@[36rem]/journey:grid-cols-3"}` : ""}`}>{milestones.map((milestone, index) => <li key={milestone.key} className={`relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 pb-7 last:pb-0 ${milestones.length > 1 ? "@[36rem]/journey:grid-cols-1 @[36rem]/journey:content-start @[36rem]/journey:gap-3 @[36rem]/journey:pb-0" : ""}`}>
        {index < milestones.length - 1 ? <span aria-hidden="true" className="absolute top-10 bottom-0 left-5 w-px bg-[var(--ui-border-strong)] @[36rem]/journey:top-5 @[36rem]/journey:bottom-auto @[36rem]/journey:left-10 @[36rem]/journey:h-px @[36rem]/journey:w-[calc(100%+1.5rem-2.5rem)]" /> : null}
        <span className={`relative flex size-10 items-center justify-center rounded-xl border ${index === milestones.length - 1 ? "border-[var(--ui-category-bronze-border)] bg-[var(--ui-category-bronze-surface)] text-[var(--ui-category-bronze-text)]" : "border-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] text-[var(--ui-text-secondary)]"}`}><milestone.icon className="size-4" aria-hidden="true" /></span>
        <div className="min-w-0"><p className="text-[11px] tabular-nums text-[var(--ui-text-muted)]">{dateOnly(milestone.date)}</p><h3 className="mt-1 text-sm font-medium leading-5">{milestone.title}</h3>
          {milestone.href ? <Link href={milestone.href} className={`mt-2 inline-block break-words rounded-sm text-xs leading-5 text-[var(--ui-text-secondary)] underline decoration-[var(--ui-border-strong)] underline-offset-4 transition-colors duration-200 hover:text-[var(--ui-text)] ${focusClass}`}>{milestone.detail}</Link> : <p className="mt-2 text-xs leading-5 text-[var(--ui-text-muted)]">{milestone.detail}</p>}
        </div>
      </li>)}</ol>
      {tenure !== null ? <p className="mt-6 flex items-start gap-2.5 border-t border-[var(--ui-border-subtle)] pt-4 text-sm font-medium leading-5"><Sparkle className="mt-0.5 size-4 shrink-0 text-[var(--ui-category-bronze-border)]" aria-hidden="true" />{t("tenure", { years: Math.floor(tenure / 12), months: tenure % 12 })}</p> : null}
      <p className="mt-3 text-[11px] leading-5 text-[var(--ui-text-muted)]">{t("journeyScope")}</p>
    </div>
  </section> : null;

  const portfolio = <section aria-labelledby="profile-projects-heading" className="@container/portfolio min-w-0">
    <div className="flex items-baseline gap-2.5"><h2 id="profile-projects-heading" className={headingClass}>{isColleague ? t("sharedProjects") : t("projects")}</h2><span className="text-sm tabular-nums text-[var(--ui-text-muted)]">{number.format(data.projectCount)}</span></div>
    {projects.length ? <ul className={`mt-4 grid overflow-hidden rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface)] ${projects.length > 1 ? "@[36rem]/portfolio:grid-cols-2" : ""}`}>{projects.map((project) => <li key={project.id} className={`min-w-0 border-b border-[var(--ui-border-subtle)] last:border-b-0 ${projects.length > 1 ? "@[36rem]/portfolio:last:odd:col-span-2" : ""} ${projects.length % 2 === 0 ? "@[36rem]/portfolio:[&:nth-last-child(2)]:border-b-0" : ""}`}>
      <EmployeeProfilePreviewLink href={`/projects/${project.id}`} title={project.name} className={`group flex h-full w-full items-start gap-3 px-5 py-3 transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:ring-inset ${focusClass}`}>
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--ui-border)] text-[var(--ui-text-muted)]"><FolderKanban className="size-3.5" /></span>
        <div className="min-w-0 flex-1"><h3 data-preview-title className="truncate text-sm font-medium leading-5">{project.name}</h3><p className="mt-1 truncate text-[11px] leading-4 text-[var(--ui-text-muted)]">{project.isActive ? t("participatingSince", { date: dateOnly(project.assignedAt) }) : `${t("pastParticipation")} · ${dateOnly(project.assignedAt)}`}</p><div className="mt-1.5 flex min-w-0 items-center gap-2"><span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${getProjectLifecycleBadgeStyle(project.status).className}`}>{statuses(project.status)}</span>{project.completed_at ? <time dateTime={project.completed_at} aria-label={t("completedOn", { date: dateOnly(project.completed_at) })} className="truncate text-[11px] text-[var(--ui-text-muted)]">{dateOnly(project.completed_at)}</time> : null}</div></div>
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-muted)] transition-colors duration-200 group-hover:text-[var(--ui-text)] group-focus-visible:text-[var(--ui-text)]" aria-hidden="true" />
      </EmployeeProfilePreviewLink>
    </li>)}</ul> : <div className="mt-4 flex items-start gap-3 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface)] p-5"><FolderKanban className="mt-0.5 size-5 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" /><p className="text-sm leading-6 text-[var(--ui-text-muted)]">{isColleague ? t("noSharedProjects") : t("noProjects")}</p></div>}
    {data.projectCount > projects.length ? <p className="mt-3 text-xs text-[var(--ui-text-muted)]">{t("recentProjectsShown", { count: projects.length, total: data.projectCount })}</p> : null}
  </section>;

  const contextLinks = activity?.currentTasks.length ? activity.currentTasks.map((task) => ({ id: task.id, title: task.title, detail: task.projectName, href: `/projects/${task.projectId}?task=${task.id}` }))
    : data.currentProjects.map((project) => ({ id: project.id, title: project.name, detail: t("currentMemberships"), href: `/projects/${project.id}` }));
  const CurrentWorkIcon = activity?.currentTasks.length ? ListTodo : FolderKanban;

  return <div className="@container mx-auto w-full max-w-[70rem] space-y-7 pb-8 sm:space-y-8">
    <div className="flex min-h-10 items-center justify-between gap-4">
      <Link href="/team" className={`inline-flex min-h-9 items-center gap-2 rounded-sm text-sm text-[var(--ui-text-muted)] transition-colors duration-200 hover:text-[var(--ui-text)] ${focusClass}`}><ArrowLeft className="size-4" aria-hidden="true" />{team("title")}</Link>
      {ownProfile ? <ProfileAvatarEditor avatarUrl={ownProfile.avatar_url} birthDate={ownProfile.birth_date} city={ownProfile.city} cityGeoNamesId={ownProfile.city_geonames_id} countryCode={ownProfile.country_code} fullName={ownProfile.full_name} joinedAt={person.joined_at} notificationPopupsEnabled={ownProfile.notification_popups_enabled} notificationSoundEnabled={ownProfile.notification_sound_enabled} systemRole={person.system_role === "admin" ? "admin" : "employee"} userId={userId} /> : null}
    </div>

    <section className="grid items-center gap-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-7" aria-labelledby="employee-name">
      <UserAvatar imageUrl={profile.avatar_url} name={profile.full_name} size="directoryPortrait" decorative className="size-28 rounded-[1.25rem] text-4xl sm:size-40 sm:rounded-[1.5rem] sm:text-5xl" />
      <div className="min-w-0">
        <h1 id="employee-name" className="break-words text-[1.875rem] leading-tight font-semibold tracking-tight text-[var(--ui-text)] sm:text-[2.125rem]">{profile.full_name}</h1>
        {profile.job_title ? <p className="mt-2 text-lg text-[var(--ui-text-secondary)]">{jobTitleKey ? roles(jobTitleKey) : profile.job_title}</p> : null}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--ui-text-muted)]">
          {location ? <p className="flex items-center gap-1.5"><MapPin className="size-3.5 shrink-0" aria-hidden="true" />{location}</p> : null}
          {person.joined_at ? <p className="flex items-center gap-1.5"><CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />{t("joinedSince", { date: dateOnly(person.joined_at) })}</p> : null}
          {tenure !== null ? <p>{t("tenure", { years: Math.floor(tenure / 12), months: tenure % 12 })}</p> : null}
        </div>
        <p className="mt-3 text-xs text-[var(--ui-text-muted)]">{t("studioAccess", { role: person.system_role === "admin" ? roles("administrator") : team("employee") })}{!person.is_active ? ` · ${team("former")}` : ""}</p>
      </div>
    </section>

    {isAdmin ? <nav aria-label={t("profileViews")} className="flex gap-6 border-b border-[var(--ui-border)]">
      {[{ href: profileHref, label: t("overview"), active: !showNotes }, { href: `${profileHref}?view=notes`, label: t("internalNotes"), active: showNotes }].map((view) => <Link key={view.href} href={view.href} aria-current={view.active ? "page" : undefined} className={`-mb-px inline-flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors duration-200 ${focusClass} ${view.active ? "border-[var(--ui-text)] text-[var(--ui-text)]" : "border-transparent text-[var(--ui-text-muted)] hover:border-[var(--ui-border-strong)] hover:text-[var(--ui-text)]"}`}>{view.label}{view.href.includes("notes") ? <LockKeyhole className="size-3" aria-hidden="true" /> : null}</Link>)}
    </nav> : null}

    {showNotes ? <div className="max-w-3xl"><EmployeeProfileNotes userId={userId} /></div> : <>
      {activity || contextLinks.length ? <section aria-labelledby="profile-current-heading" className="grid items-center gap-3 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-subtle)] p-4 sm:px-5 @[50rem]:grid-cols-[minmax(15rem,0.9fr)_minmax(0,1.5fr)] @[50rem]:gap-6">
        <div><h2 id="profile-current-heading" className="flex items-center gap-2 text-sm font-medium"><Activity className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true" />{isColleague ? t("sharedCurrentWork") : t("currentWork")}</h2><p className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs leading-5 text-[var(--ui-text-secondary)]"><span>{t("activeProjectsCount", { count: data.activeProjectCount })}</span>{activity ? <span>{t("inProgressTasksCount", { count: activity.inProgressTasks })}</span> : null}</p></div>
        {contextLinks.length ? <ul className={`grid gap-2 ${contextLinks.length > 1 ? "sm:grid-cols-2" : ""}`}>{contextLinks.map((item) => <li key={item.id} className="min-w-0"><EmployeeProfilePreviewLink href={item.href} title={item.title} className={`group flex w-full items-center gap-3 rounded-lg p-2 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] ${focusClass}`}><span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)] transition-colors duration-200 group-hover:text-[var(--ui-text-secondary)] group-focus-visible:text-[var(--ui-text-secondary)]"><CurrentWorkIcon className="size-4" /></span><div className="min-w-0 flex-1"><p data-preview-title className="truncate text-sm font-medium leading-5">{item.title}</p><p className="mt-1 truncate text-xs leading-5 text-[var(--ui-text-muted)]">{item.detail}</p></div><ArrowUpRight className="size-3.5 shrink-0 text-[var(--ui-text-muted)] transition-colors duration-200 group-hover:text-[var(--ui-text-secondary)] group-focus-visible:text-[var(--ui-text-secondary)]" aria-hidden="true" /></EmployeeProfilePreviewLink></li>)}</ul> : <p className="text-sm leading-6 text-[var(--ui-text-muted)]">{t("noCurrentWork")}</p>}
      </section> : null}

      {activity ? <section aria-labelledby="profile-activity-heading" aria-describedby="profile-activity-description" className="min-w-0 overflow-hidden rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface)]">
        <div className="p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="profile-activity-heading" className={headingClass}>{isOwn ? t("personalActivity") : t("taskActivity")}</h2><p className="mt-1.5 text-sm text-[var(--ui-text-secondary)]">{t("heatmapTotal", { count: activity.heatmap.total })}</p></div><p className="flex items-center gap-2 pt-1 text-xs font-medium whitespace-nowrap tabular-nums text-[var(--ui-text-secondary)]"><CalendarDays className="size-3.5 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" /><span>{dateOnly(activity.heatmap.start)} — {dateOnly(activity.heatmap.end)}</span></p></div>
          <p id="profile-activity-description" className="sr-only">{t("heatmapDescription")}</p>
          <div className="mt-5"><EmployeeProfileHeatmap heatmap={activity.heatmap} /></div>
          {activity.heatmap.total === 0 ? <p className="mt-3 text-xs leading-5 text-[var(--ui-text-muted)]">{t("heatmapEmpty")}</p> : null}
        </div>
        <div className="border-t border-[var(--ui-border-subtle)] px-4 py-4 sm:px-6">
          <dl className="grid grid-cols-3 gap-x-5 text-xs">
            {[{ label: t("completedTasks"), value: activity.completedTasks }, { label: t("projectParticipation"), value: data.projectCount }, { label: t("completedProjects"), value: data.completedProjectCount }].map((metric) => <div key={metric.label} className="flex min-w-0 flex-col gap-1"><dt className="order-2 leading-5 text-[var(--ui-text-muted)]">{metric.label}</dt><dd className="order-1 text-base leading-6 font-semibold tabular-nums">{number.format(metric.value)}</dd></div>)}
          </dl>
          <p className="mt-3 text-[11px] leading-5 text-[var(--ui-text-muted)]">{t("allTime")} · {t("accessibleProjects")}</p>
        </div>
      </section> : null}

      <div className={`grid items-start gap-7 ${journey ? "@[58rem]:grid-cols-[minmax(0,1.45fr)_minmax(18rem,1fr)] @[58rem]:gap-8" : ""}`}>{portfolio}{journey}</div>

      {isAdmin && (work || employment) ? <section aria-labelledby="profile-private-heading" className="border-t border-[var(--ui-border)] pt-7">
        <div className="flex items-center gap-2.5"><LockKeyhole className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true" /><h2 id="profile-private-heading" className={headingClass}>{t("privateContext")}</h2></div><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("notesPrivacy")}</p>
        <div className="mt-5 grid items-start gap-7 @[50rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] @[50rem]:gap-8">
          {work ? <section aria-labelledby="profile-contribution-heading" className="min-w-0 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface)] p-5 sm:p-6">
            <h3 id="profile-contribution-heading" className="text-sm font-medium">{t("contribution")}</h3>
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-4">{[{ label: t("creditedArea"), value: `${number.format(work.areaM2)} ${t("m2")}` }, { label: t("creditedTaskCompletions"), value: number.format(work.completedTasks) }].map((metric) => <div key={metric.label} className="flex min-w-0 flex-col"><dt className="order-2 mt-1 text-xs text-[var(--ui-text-muted)]">{metric.label}</dt><dd className="order-1 text-2xl font-semibold tabular-nums">{metric.value}</dd></div>)}</dl><p className="mt-2 text-[11px] text-[var(--ui-text-muted)]">{t("allTime")}</p>
            <div className="mt-5 border-t border-[var(--ui-border-subtle)] pt-4"><h4 id="profile-history-heading" className="text-xs font-medium">{t("recentContribution")}</h4><p className="mt-1 text-[11px] leading-5 text-[var(--ui-text-muted)]">{t("recentDescription")}</p>
              {work.history.some((entry) => entry.completedTasks > 0 || entry.areaM2 > 0) ? <ul className="mt-4 grid grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 text-xs">{work.history.map((entry) => <li key={entry.start} className="col-span-3 grid grid-cols-subgrid items-center"><span className="text-[var(--ui-text-muted)]">{month.format(new Date(entry.start))}</span><span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[var(--ui-surface-muted)]"><span className="block h-full rounded-full bg-[var(--ui-text-secondary)]" style={{ width: `${entry.areaM2 / maximumArea * 100}%` }} /></span><span className="whitespace-nowrap text-right tabular-nums text-[var(--ui-text-secondary)]">{number.format(entry.areaM2)} {t("m2")}</span></li>)}</ul> : <p className="mt-3 text-xs text-[var(--ui-text-muted)]">{t("noContribution")}</p>}
            </div>
          </section> : null}
          {employment ? <section aria-labelledby="profile-employment-heading" className="min-w-0">
            <h3 id="profile-employment-heading" className="text-sm font-medium">{t("employmentSummary")}</h3><p className="mt-2 text-[11px] leading-5 text-[var(--ui-text-muted)]">{t("employmentAsOf", { date: dateOnly(employment.asOf) })}</p>
            <dl className="mt-2 divide-y divide-[var(--ui-border-subtle)] text-sm">
              <div className="flex items-baseline justify-between gap-3 py-3"><dt className="text-[var(--ui-text-secondary)]">{t("absences")}</dt><dd className="text-right font-medium tabular-nums">{t("absenceRequests", { count: employment.absenceRequests })}</dd></div>
              <div className="flex items-baseline justify-between gap-3 py-3"><dt className="text-[var(--ui-text-secondary)]">{t("workMakeup")}</dt><dd className="text-right font-medium tabular-nums">{t("hours", { count: number.format(employment.makeupMinutes / 60) })}</dd></div>
              {employment.availableVacationDays !== null ? <div className="flex items-baseline justify-between gap-3 py-3"><dt className="text-[var(--ui-text-secondary)]">{t("availableVacation")}</dt><dd className="text-right font-medium tabular-nums">{t("days", { count: employment.availableVacationDays })}</dd></div> : null}
            </dl><p className="mt-2 text-[11px] leading-5 text-[var(--ui-text-muted)]">{t("makeupDescription")}</p>
            {employment.vacationPeriods.length ? <div className="mt-4 border-t border-[var(--ui-border-subtle)] pt-4"><h4 className="text-xs font-medium text-[var(--ui-text-secondary)]">{t("vacationPeriods")}</h4><ul className="mt-2 space-y-2 text-xs text-[var(--ui-text-muted)]">{employment.vacationPeriods.map((period) => <li key={period.id}>{dateOnly(period.startDate)}{period.startDate !== period.endDate ? ` — ${dateOnly(period.endDate)}` : ""}</li>)}</ul></div> : null}
          </section> : null}
        </div>
      </section> : null}
    </>}
  </div>;
}
