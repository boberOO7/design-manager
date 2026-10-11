import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import type { Database } from "@/types/database.types";

type Notification = Pick<Database["public"]["Tables"]["notifications"]["Row"], "metadata"> & { notification_type: string };

function concise(value: string, limit: number) {
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("").trimEnd()}…` : text;
}

// Only explicit, operational metadata is eligible for an OS preview. Never use
// persisted free-form titles/bodies, people, locations, notes or financial data.
export function getWebPushPreview(notification: Notification, locale: string, calendarContextAllowed = false) {
  const language = locale === "en" ? "en" : "uk";
  const t = createTranslator({ locale: language, messages: language === "en" ? en : uk, namespace: "Notifications" });
  const metadata = notification.metadata && typeof notification.metadata === "object" && !Array.isArray(notification.metadata) ? notification.metadata : {};
  const value = (key: string, limit = 90) => typeof metadata[key] === "string" ? concise(metadata[key], limit) : "";
  const subject = value("subject") || value("taskTitle");
  const project = value("projectName", 45);
  const context = (name: string, fallback: string) => name
    ? project ? t("pushSubjectProjectBody", { subject: name, project }) : t("pushSubjectBody", { subject: name })
    : fallback;
  const statusKeys = {
    assigned: "statusAssigned", in_progress: "statusInProgress", done: "statusDone", cancelled: "statusCancelled",
    new: "statusNew", accepted: "statusAccepted", rejected: "statusRejected", discussion: "statusDiscussion",
    planned: "statusPlanned", implemented: "statusImplemented", reviewing: "statusReviewing", action_taken: "statusActionTaken", closed: "statusClosed",
  } as const;
  const status = value("status");
  const statusKey = Object.entries(statusKeys).find(([key]) => key === status)?.[1];
  let title = "StudioFlow";
  let body = t("pushGenericBody");
  switch (notification.notification_type) {
    case "task_assigned":
      title = t(value("assignmentKind") === "collaborator" ? "pushTaskCollaboratorTitle" : "taskAssignedTitle");
      body = context(subject, t("pushOpenTaskBody"));
      break;
    case "task_review_requested":
      title = t("taskReviewRequestedTitle");
      body = context(subject, t("pushOpenTaskBody"));
      break;
    case "task_details_changed": {
      const change = value("change");
      title = t(change === "due_date" ? "pushTaskDueDateTitle" : change === "priority" ? "pushTaskPriorityTitle" : change === "priority_and_due_date" ? "pushTaskPriorityAndDueDateTitle" : "taskDetailsChangedTitle");
      body = context(subject, t("pushOpenTaskBody"));
      break;
    }
    case "calendar_event_invitation":
    case "calendar_event_assigned":
    case "calendar_event_updated":
    case "calendar_event_cancelled":
      title = t(notification.notification_type === "calendar_event_invitation" ? "calendarInvitationTitle" : notification.notification_type === "calendar_event_assigned" ? "calendarAssignedTitle" : notification.notification_type === "calendar_event_updated" ? "calendarEventUpdatedTitle" : "calendarEventCancelledTitle");
      body = context(calendarContextAllowed ? value("eventTitle") : "", t("pushOpenCalendarBody"));
      break;
    case "time_off_request_submitted":
    case "time_off_request_approved":
    case "time_off_request_rejected":
    case "time_off_request_cancelled":
      title = t(notification.notification_type === "time_off_request_submitted" ? "timeOffSubmittedTitle" : notification.notification_type === "time_off_request_approved" ? "timeOffApprovedTitle" : notification.notification_type === "time_off_request_rejected" ? "timeOffRejectedTitle" : "timeOffCancelledTitle");
      body = t("pushOpenRequestBody");
      break;
    case "submission_created":
    case "submission_assigned":
    case "submission_status_changed": {
      const complaint = value("type") === "complaint";
      title = t(notification.notification_type === "submission_created" ? complaint ? "submissionComplaintCreatedTitle" : "submissionRequestCreatedTitle" : notification.notification_type === "submission_assigned" ? complaint ? "submissionComplaintAssignedTitle" : "submissionRequestAssignedTitle" : complaint ? "submissionComplaintUpdatedTitle" : "submissionRequestUpdatedTitle");
      body = notification.notification_type === "submission_status_changed" && statusKey ? t("pushStatusBody", { status: t(statusKey) }) : t("pushOpenRequestBody");
      break;
    }
    case "office_assignment_assigned":
      title = t("officeAssignmentAssignedTitle");
      // Office assignments can contain internal/private business information.
      body = t("pushOpenAssignmentBody");
      break;
    case "office_assignment_status_changed":
      title = t("officeAssignmentUpdatedTitle");
      body = statusKey ? t("pushStatusBody", { status: t(statusKey) }) : t("pushOpenAssignmentBody");
      break;
    case "crm_lead_follow_up":
      title = t("crmLeadFollowUpTitle");
      body = t("pushContactLeadBody");
      break;
    case "equipment_maintenance_upcoming":
    case "equipment_maintenance_overdue":
      title = t(notification.notification_type === "equipment_maintenance_upcoming" ? "equipmentMaintenanceUpcomingTitle" : "equipmentMaintenanceOverdueTitle");
      body = context(value("equipmentName"), t("pushOpenEquipmentBody"));
      break;
  }
  return { title: concise(title, 64), body: concise(body, 160) };
}
