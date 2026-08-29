import type { Database } from "@/types/database.types";

export const CALENDAR_EVENT_TYPES = ["meeting", "client_presentation", "interview", "site_visit", "internal_review", "business_trip", "work_makeup", "other"] as const;
export const CALENDAR_EVENT_INVITATION_STATUSES = ["pending", "accepted", "declined"] as const;
export const TIME_OFF_REQUEST_TYPES = ["vacation", "day_off", "medical_appointment", "sick_leave", "other"] as const;
export const TIME_OFF_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];
export type MeetingMode = "offline" | "online";
export type CalendarEventInvitationStatus = (typeof CALENDAR_EVENT_INVITATION_STATUSES)[number];
export type TimeOffRequestType = (typeof TIME_OFF_REQUEST_TYPES)[number];
export type TimeOffStatus = (typeof TIME_OFF_STATUSES)[number];
export type CalendarView = "month" | "week" | "agenda";
export type { RecurrenceRule } from "@/lib/calendar-recurrence";

export type CalendarProject = Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name" | "project_code" | "client_name" | "status" | "city" | "country_code">;
export type CalendarPerson = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "job_title" | "avatar_url"> & { projectIds: string[] };
export type CalendarEventInvitee = CalendarPerson & { inviteId: string; status: CalendarEventInvitationStatus };
export type CalendarCompensation = { requiredMinutes: number; compensatedMinutes: number; remainingMinutes: number };
export type CalendarCompensableDayOff = { id: string; startDate: string; endDate: string; startTime: string | null; endTime: string | null; allDay: boolean; remainingMinutes: number };

type CalendarBase = {
  key: string;
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  projectId: string | null;
  personIds: string[];
};

type CalendarTimeOffSubject = {
  subjectUserId: string;
  subjectName: string;
};

type CalendarSystemMember = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
};

export type CalendarItem =
  | (CalendarBase & {
      source: "calendar_event";
      eventType: CalendarEventType;
      startsAt: string;
      endsAt: string;
      description: string | null;
      location: string | null;
      meetingUrl: string | null;
      meetingMode: MeetingMode | null;
      recurrenceRule?: import("@/lib/calendar-recurrence").RecurrenceRule | null;
      seriesId?: string | null;
      occurrenceStart?: string | null;
      compensatesTimeOffRequestId?: string | null;
      compensationDayOff?: CalendarCompensableDayOff | null;
      assigneeId?: string | null;
      assignee?: CalendarPerson | null;
      participants: CalendarPerson[];
      project: { id: string; name: string } | null;
      organizer: CalendarPerson;
      invitees: CalendarEventInvitee[];
    })
  | (CalendarBase & {
      source: "project_deadline";
      project: { id: string; name: string; clientName: string | null; status: string };
    })
  | (CalendarBase & {
      source: "task_deadline";
      task: {
        id: string;
        projectId: string;
        projectName: string;
        description: string | null;
        status: string;
        priority: string;
        assigneeId: string;
        assigneeName: string;
      };
    })
  | (CalendarBase & CalendarTimeOffSubject & {
      source: "time_off";
      startTime: string | null;
      endTime: string | null;
    })
  | (CalendarBase & CalendarTimeOffSubject & {
      source: "time_off_request_admin";
      requestType: TimeOffRequestType;
      status: TimeOffStatus;
      startTime: string | null;
      endTime: string | null;
      privateNote: string | null;
      reviewNote: string | null;
      reviewedBy: string | null;
      reviewedAt: string | null;
      isOwn: boolean;
      compensation?: CalendarCompensation | null;
    })
  | (CalendarBase & {
      source: "birthday";
      member: CalendarSystemMember;
    })
  | (CalendarBase & {
      source: "team_anniversary";
      member: CalendarSystemMember;
      anniversaryYears: number;
    })
  | (CalendarBase & {
      source: "salary_payment";
      member: CalendarSystemMember;
    });

export type CalendarFilters = {
  events: boolean;
  projectDeadlines: boolean;
  taskDeadlines: boolean;
  timeOff: boolean;
  birthdays: boolean;
  teamAnniversaries: boolean;
  salaryPayments: boolean;
  projectId: string;
  personId: string;
  mine: boolean;
};

export type CalendarPageData = {
  items: CalendarItem[];
  projects: CalendarProject[];
  people: CalendarPerson[];
  currentUserId: string;
  isAdmin: boolean;
  pendingCount: number;
  rangeStart: string;
  rangeEnd: string;
  today: string;
  compensableDayOffs: CalendarCompensableDayOff[];
};
