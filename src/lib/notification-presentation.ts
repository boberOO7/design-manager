import type { NotificationItem } from "@/data/queries/notifications";

export type NotificationMessageKey =
  | "calendarAssignedBody"
  | "calendarAssignedTitle"
  | "calendarEventCancelledBody"
  | "calendarEventCancelledTitle"
  | "calendarEventUpdatedBody"
  | "calendarEventUpdatedTitle"
  | "calendarInvitationBody"
  | "calendarInvitationTitle"
  | "crmLeadFollowUpBody"
  | "crmLeadFollowUpTitle"
  | "officeAssignmentAssignedBody"
  | "officeAssignmentAssignedTitle"
  | "officeAssignmentUpdatedBody"
  | "officeAssignmentUpdatedTitle"
  | "requestTypeDayOff"
  | "requestTypeMedicalAppointment"
  | "requestTypeOther"
  | "requestTypeSickLeave"
  | "requestTypeVacation"
  | "statusAccepted"
  | "statusActionTaken"
  | "statusAssigned"
  | "statusCancelled"
  | "statusClosed"
  | "statusDiscussion"
  | "statusDone"
  | "statusImplemented"
  | "statusInProgress"
  | "statusNew"
  | "statusPlanned"
  | "statusRejected"
  | "statusReviewing"
  | "submissionAssignedBody"
  | "submissionComplaintAssignedTitle"
  | "submissionComplaintCreatedTitle"
  | "submissionComplaintUpdatedTitle"
  | "submissionCreatedAnonymousBody"
  | "submissionCreatedBody"
  | "submissionRequestAssignedTitle"
  | "submissionRequestCreatedTitle"
  | "submissionRequestUpdatedTitle"
  | "submissionUpdatedBody"
  | "taskAssignedBody"
  | "taskAssignedTitle"
  | "taskCollaboratorAssignedBody"
  | "taskDetailsChangedTitle"
  | "taskDueDateChangedBody"
  | "taskDueDateRemovedBody"
  | "taskPriorityAndDueDateChangedBody"
  | "taskPriorityChangedBody"
  | "timeOffApprovedTitle"
  | "timeOffCancelledBody"
  | "timeOffCancelledTitle"
  | "timeOffDecisionBody"
  | "timeOffRejectedTitle"
  | "timeOffSubmittedBody"
  | "timeOffSubmittedTitle";

type TranslationValues = Record<string, string | number>;
export type NotificationTranslator = (key: NotificationMessageKey, values?: TranslationValues) => string;

function objectMetadata(item: NotificationItem): Record<string, unknown> {
  return typeof item.metadata === "object" && item.metadata !== null && !Array.isArray(item.metadata)
    ? item.metadata
    : {};
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === "string" ? metadata[key] : null;
}

function metadataBoolean(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === "boolean" ? metadata[key] : null;
}

function quotedValue(value: string) {
  return /[“"](.+?)[”"]/.exec(value)?.[1] ?? null;
}

function formatDateOnly(value: string, locale: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date).replace(/\.$/, "");
}

function formatDateRange(startDate: string, endDate: string | null, locale: string) {
  const start = formatDateOnly(startDate, locale);
  return endDate && endDate !== startDate ? `${start}–${formatDateOnly(endDate, locale)}` : start;
}

function legacyRequestType(value: string) {
  const types: Record<string, string> = {
    "Day Off": "day_off",
    "Medical Appointment": "medical_appointment",
    "Sick Leave": "sick_leave",
    "Vacation": "vacation",
    "Other": "other",
  };
  return types[value] ?? null;
}

function legacyDate(value: string) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/.exec(value);
  if (!match) return null;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(match[1]) + 1;
  return `2000-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function legacyTimeOffFields(item: NotificationItem) {
  const submitted = /^(.+) requested (.+) for (.+)\.$/.exec(item.body);
  const cancelled = /^(.+) request for (.+) was cancelled\.$/.exec(item.body);
  const decision = /^(.+) request for (.+)\.$/.exec(item.body);
  const match = submitted ?? cancelled ?? decision;
  if (!match) return null;
  const type = legacyRequestType(submitted ? match[2] : match[1]);
  const dateRange = (submitted ? match[3] : match[2]).split("–");
  const startDate = legacyDate(dateRange[0]);
  const endDate = legacyDate(dateRange[1] ?? dateRange[0]);
  if (!type || !startDate || !endDate) return null;
  return { endDate, requester: submitted?.[1] ?? null, startDate, type };
}

function requestTypeLabel(type: string, t: NotificationTranslator) {
  const keys: Record<string, NotificationMessageKey> = {
    day_off: "requestTypeDayOff",
    medical_appointment: "requestTypeMedicalAppointment",
    other: "requestTypeOther",
    sick_leave: "requestTypeSickLeave",
    vacation: "requestTypeVacation",
  };
  const key = keys[type];
  return key ? t(key) : type.replaceAll("_", " ");
}

function statusLabel(status: string, t: NotificationTranslator) {
  const keys: Record<string, NotificationMessageKey> = {
    accepted: "statusAccepted",
    action_taken: "statusActionTaken",
    assigned: "statusAssigned",
    cancelled: "statusCancelled",
    closed: "statusClosed",
    discussion: "statusDiscussion",
    done: "statusDone",
    implemented: "statusImplemented",
    in_progress: "statusInProgress",
    new: "statusNew",
    planned: "statusPlanned",
    rejected: "statusRejected",
    reviewing: "statusReviewing",
  };
  const key = keys[status];
  return key ? t(key) : status.replaceAll("_", " ");
}

function submissionType(item: NotificationItem, metadata: Record<string, unknown>) {
  const storedType = metadataString(metadata, "type");
  if (storedType === "request" || storedType === "complaint") return storedType;
  return item.title.toLowerCase().includes("complaint") ? "complaint" : "request";
}

function taskDetailsBody(item: NotificationItem, metadata: Record<string, unknown>, locale: string, t: NotificationTranslator) {
  const task = metadataString(metadata, "taskTitle") ?? quotedValue(item.body);
  const change = metadataString(metadata, "change");
  if (!task) return item.body;
  if (change === "priority_and_due_date" || item.body.startsWith("Priority and due date")) {
    return t("taskPriorityAndDueDateChangedBody", { task });
  }
  if (change === "priority" || item.body.startsWith("Priority changed")) {
    return t("taskPriorityChangedBody", { task });
  }
  const dueDate = metadataString(metadata, "dueDate");
  if (change === "due_date" && dueDate) {
    return t("taskDueDateChangedBody", { task, date: formatDateOnly(dueDate, locale) });
  }
  if (change === "due_date" || item.body.includes("due date")) {
    const legacyDate = / changed to (.+)\.$/.exec(item.body)?.[1];
    return legacyDate
      ? t("taskDueDateChangedBody", { task, date: legacyDate })
      : t("taskDueDateRemovedBody", { task });
  }
  return item.body;
}

export function getNotificationPresentation(item: NotificationItem, locale: string, t: NotificationTranslator) {
  const metadata = objectMetadata(item);
  const subject = metadataString(metadata, "subject") ?? metadataString(metadata, "taskTitle") ?? metadataString(metadata, "eventTitle") ?? quotedValue(item.body);

  switch (item.notification_type) {
    case "crm_lead_follow_up": {
      const lead = metadataString(metadata, "leadName") ?? subject;
      return {
        title: t("crmLeadFollowUpTitle"),
        body: lead ? t("crmLeadFollowUpBody", { lead }) : item.body,
      };
    }
    case "calendar_event_invitation": {
      const title = metadataString(metadata, "eventTitle") ?? item.title;
      const organizer = metadataString(metadata, "organizerName") ?? item.actorName ?? "";
      return { title: t("calendarInvitationTitle"), body: t("calendarInvitationBody", { organizer, title }) };
    }
    case "calendar_event_assigned":
      return subject
        ? { title: t("calendarAssignedTitle"), body: t("calendarAssignedBody", { title: subject }) }
        : { title: t("calendarAssignedTitle"), body: item.body };
    case "calendar_event_updated":
      return { title: t("calendarEventUpdatedTitle"), body: t("calendarEventUpdatedBody", { title: metadataString(metadata, "eventTitle") ?? item.title }) };
    case "calendar_event_cancelled":
      return { title: t("calendarEventCancelledTitle"), body: t("calendarEventCancelledBody", { title: metadataString(metadata, "eventTitle") ?? item.title }) };
    case "task_assigned": {
      const project = metadataString(metadata, "projectName") ?? /[”"] in (.+)\.$/.exec(item.body)?.[1] ?? null;
      const assignmentKind = metadataString(metadata, "assignmentKind");
      const bodyKey = assignmentKind === "collaborator" || item.body.startsWith("You were added") ? "taskCollaboratorAssignedBody" : "taskAssignedBody";
      return subject && project
        ? { title: t("taskAssignedTitle"), body: t(bodyKey, { project, task: subject }) }
        : { title: t("taskAssignedTitle"), body: item.body };
    }
    case "task_details_changed":
      return { title: t("taskDetailsChangedTitle"), body: taskDetailsBody(item, metadata, locale, t) };
    case "time_off_request_submitted":
    case "time_off_request_approved":
    case "time_off_request_rejected":
    case "time_off_request_cancelled": {
      const legacy = legacyTimeOffFields(item);
      const requestType = metadataString(metadata, "requestType") ?? legacy?.type ?? null;
      const startDate = metadataString(metadata, "startDate") ?? legacy?.startDate ?? null;
      const endDate = metadataString(metadata, "endDate") ?? legacy?.endDate ?? null;
      const date = startDate ? formatDateRange(startDate, endDate, locale) : null;
      const type = requestType ? requestTypeLabel(requestType, t) : null;
      if (item.notification_type === "time_off_request_submitted") {
        const requester = metadataString(metadata, "requesterName") ?? item.actorName ?? legacy?.requester;
        return {
          title: t("timeOffSubmittedTitle"),
          body: requester && type && date ? t("timeOffSubmittedBody", { date, requester, type }) : item.body,
        };
      }
      const titleKey = item.notification_type === "time_off_request_approved"
        ? "timeOffApprovedTitle"
        : item.notification_type === "time_off_request_rejected"
          ? "timeOffRejectedTitle"
          : "timeOffCancelledTitle";
      const bodyKey = item.notification_type === "time_off_request_cancelled" ? "timeOffCancelledBody" : "timeOffDecisionBody";
      return { title: t(titleKey), body: type && date ? t(bodyKey, { date, type }) : item.body };
    }
    case "submission_created": {
      const type = submissionType(item, metadata);
      const titleKey = type === "complaint" ? "submissionComplaintCreatedTitle" : "submissionRequestCreatedTitle";
      if (!subject) return { title: t(titleKey), body: item.body };
      const anonymous = metadataBoolean(metadata, "anonymous") === true;
      const author = metadataString(metadata, "authorName") ?? item.actorName ?? item.body.split(": “", 1)[0];
      return {
        title: t(titleKey),
        body: anonymous ? t("submissionCreatedAnonymousBody", { subject }) : t("submissionCreatedBody", { author, subject }),
      };
    }
    case "submission_assigned": {
      const type = submissionType(item, metadata);
      const titleKey = type === "complaint" ? "submissionComplaintAssignedTitle" : "submissionRequestAssignedTitle";
      return subject
        ? { title: t(titleKey), body: t("submissionAssignedBody", { subject }) }
        : { title: t(titleKey), body: item.body };
    }
    case "submission_status_changed": {
      const type = submissionType(item, metadata);
      const titleKey = type === "complaint" ? "submissionComplaintUpdatedTitle" : "submissionRequestUpdatedTitle";
      const status = metadataString(metadata, "status");
      return subject && status
        ? { title: t(titleKey), body: t("submissionUpdatedBody", { status: statusLabel(status, t), subject }) }
        : { title: t(titleKey), body: item.body };
    }
    case "office_assignment_assigned":
      return subject
        ? { title: t("officeAssignmentAssignedTitle"), body: t("officeAssignmentAssignedBody", { subject }) }
        : { title: t("officeAssignmentAssignedTitle"), body: item.body };
    case "office_assignment_status_changed": {
      const status = metadataString(metadata, "status");
      return subject && status
        ? { title: t("officeAssignmentUpdatedTitle"), body: t("officeAssignmentUpdatedBody", { status: statusLabel(status, t), subject }) }
        : { title: t("officeAssignmentUpdatedTitle"), body: item.body };
    }
  }
}

export function formatNotificationRelativeTime(value: string, locale: string, now = Date.now()) {
  const elapsedMinutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60_000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  if (elapsedMinutes < 1) return formatter.format(0, "second");
  if (elapsedMinutes < 60) return formatter.format(-elapsedMinutes, "minute");
  if (elapsedMinutes < 1_440) return formatter.format(-Math.floor(elapsedMinutes / 60), "hour");
  return formatter.format(-Math.floor(elapsedMinutes / 1_440), "day");
}
