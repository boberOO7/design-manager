import { getLocale, getTranslations } from "next-intl/server";
import { getEmployeeProfileNotes } from "@/data/queries/employee-profile-notes";
import { EmployeeProfileNoteForm } from "@/components/team/employee-profile-note-form";
import { APPLICATION_TIME_ZONE } from "@/lib/calendar";
import { getLeaderboardMonthRange } from "@/lib/productivity";

export async function EmployeeProfileNotes({ userId }: { userId: string }) {
  const [notes, locale, t] = await Promise.all([getEmployeeProfileNotes(userId), getLocale(), getTranslations("EmployeeProfile")]);
  const groups = new Map<string, typeof notes>();
  for (const note of notes) {
    const entries = groups.get(note.review_month) ?? [];
    entries.push(note);
    groups.set(note.review_month, entries);
  }
  const reviewMonth = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const writtenDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: APPLICATION_TIME_ZONE });
  return <section aria-labelledby="employee-notes-heading" className="space-y-5">
    <EmployeeProfileNoteForm userId={userId} currentMonth={getLeaderboardMonthRange("month").from} />
    {notes.length ? <div className="space-y-6">{[...groups].map(([period, entries]) => <section key={period} aria-label={reviewMonth.format(new Date(`${period}T00:00:00Z`))}>
      <h3 className="text-sm font-semibold text-[var(--ui-text-secondary)]">{reviewMonth.format(new Date(`${period}T00:00:00Z`))}</h3>
      <div className="mt-2 divide-y divide-[var(--ui-border-subtle)]">{entries.map((entry) => <article key={entry.id} className="py-4">
        <p className="max-w-prose whitespace-pre-wrap break-words text-sm leading-6">{entry.note}</p>
        <p className="mt-2 text-xs text-[var(--ui-text-muted)]">{entry.author?.full_name ?? t("unknownAuthor")} · {t("writtenOn", { date: writtenDate.format(new Date(entry.created_at)) })}</p>
      </article>)}</div>
    </section>)}</div> : <p className="text-sm text-[var(--ui-text-muted)]">{t("noNotes")}</p>}
  </section>;
}
