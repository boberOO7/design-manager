import type { AbstractIntlMessages } from "next-intl";
import type en from "../../messages/en.json";

type Namespace = keyof typeof en;

// Whole namespaces belong to domains, including their optional editors/drawers.
const taskMessages = ["Tasks", "Checklists", "Templates", "Status", "Priority", "TaskStages", "Validation", "Roles"] as const;

export const messageScopes = {
  root: ["Common", "Account"],
  shell: ["Navigation", "Notifications", "CitySearch"],
  dashboard: ["Dashboard", ...taskMessages],
  projects: ["Projects", "ProjectForm", "ProjectTypes", "ProjectWorkspace", "Workspace", "StageConfiguration", "BoardTaskCard", "ProjectTemplates", "Team", "Calendar", ...taskMessages],
  tasks: taskMessages,
  calendar: ["Calendar", "TimeOff", "Status", "Priority"],
  crm: ["Crm", "ProjectForm", "ProjectTypes", "Priority", "Roles"],
  finance: ["Finance"],
  office: ["Office"],
  equipment: ["Equipment"],
  assignments: ["OfficeAssignments"],
  submissions: ["Submissions"],
  team: ["Team", "Roles"],
  administration: ["Administration", "Availability", "Calendar", "TimeOff", "Templates"],
  leaderboard: ["Leaderboard", "Administration"],
  contractors: ["Contractors"],
} as const satisfies Record<string, readonly Namespace[]>;

export function selectMessages(messages: AbstractIntlMessages, scope: keyof typeof messageScopes): AbstractIntlMessages {
  return Object.fromEntries(messageScopes[scope].map((namespace) => {
    const value = messages[namespace];
    if (!value) throw new Error(`Missing translation namespace: ${namespace}`);
    return [namespace, value];
  }));
}
