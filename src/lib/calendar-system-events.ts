import type { CalendarItem } from "@/types/calendar";

export type CalendarSystemEventMember = {
  membershipId: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  birthDate: string | null;
  joinedAt: string | null;
};

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Creates an annual date from a source date. Feb 29 is observed on Feb 28 in
 * non-leap years so every source record has one valid visible occurrence.
 */
export function annualCalendarDate(sourceDate: string, year: number): string | null {
  const match = /^(?:\d{4})-(\d{2})-(\d{2})$/.exec(sourceDate);
  if (!match) return null;
  const month = Number(match[1]);
  let day = Number(match[2]);
  if (month === 2 && day === 29 && !isLeapYear(year)) day = 28;
  const candidate = new Date(year, month - 1, day, 12);
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

function rangeYears(start: string, end: string): number[] {
  const first = Number(start.slice(0, 4));
  const last = Number(end.slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function buildCalendarSystemEvents(members: CalendarSystemEventMember[], start: string, end: string): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const member of members) {
    for (const year of rangeYears(start, end)) {
      const birthday = member.birthDate ? annualCalendarDate(member.birthDate, year) : null;
      if (birthday && birthday >= start && birthday <= end) {
        items.push({ source: "birthday", key: `birthday:${member.userId}:${year}`, id: `birthday:${member.userId}:${year}`, title: member.fullName, startDate: birthday, endDate: birthday, allDay: true, projectId: null, personIds: [member.userId], member: { userId: member.userId, fullName: member.fullName, avatarUrl: member.avatarUrl } });
      }
      const joinedDate = member.joinedAt?.slice(0, 10);
      const anniversary = joinedDate ? annualCalendarDate(joinedDate, year) : null;
      if (anniversary && anniversary >= start && anniversary <= end) {
        items.push({ source: "team_anniversary", key: `anniversary:${member.membershipId}:${year}`, id: `anniversary:${member.membershipId}:${year}`, title: member.fullName, startDate: anniversary, endDate: anniversary, allDay: true, projectId: null, personIds: [member.userId], member: { userId: member.userId, fullName: member.fullName, avatarUrl: member.avatarUrl } });
      }
    }
  }
  return items;
}
