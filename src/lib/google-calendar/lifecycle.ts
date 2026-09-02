import { getGoogleCalendarFailureDiagnostic } from "@/lib/google-calendar/diagnostics";

export type GoogleCalendarDeleteFailureClass = "authorization_unavailable" | "missing" | "retryable" | "unknown";

export type GoogleCalendarDisconnectLifecycle = {
  deleteRemoteCalendar: () => Promise<void>;
  removeConnection: () => Promise<void>;
  removeMappings: () => Promise<void>;
  reportIgnoredFailure?: (stage: "calendar_delete" | "credential_revoke", error: unknown) => void;
  revokeCredentials: () => Promise<void>;
};

export class GoogleCalendarAuthorizationUnavailableError extends Error {}

export function googleCalendarName(studioName: string): string {
  return `${studioName.trim()} Team`;
}

export function classifyGoogleCalendarDeleteFailure(error: unknown): GoogleCalendarDeleteFailureClass {
  if (error instanceof GoogleCalendarAuthorizationUnavailableError) return "authorization_unavailable";

  const diagnostic = getGoogleCalendarFailureDiagnostic(error);
  const status = diagnostic.httpStatus;
  const reason = diagnostic.reason?.toLowerCase() ?? "";
  const message = diagnostic.message.toLowerCase();
  const retryableReason = /backenderror|internalerror|ratelimitexceeded|userratelimitexceeded/.test(reason);

  if (status === 408 || status === 429 || (status !== undefined && status >= 500) || retryableReason) {
    return "retryable";
  }
  if (status === 404 || status === 410 || /\b404\b|\b410\b|not found|already missing/.test(message)) {
    return "missing";
  }
  if (
    status === 401
    || /autherror|insufficientpermissions/.test(reason)
    || /invalid_grant|invalid credentials|unauthorized|authorization is unavailable|expired|revoked|login required/.test(message)
  ) {
    return "authorization_unavailable";
  }
  return "unknown";
}

/**
 * Enforces the destructive lifecycle order. Shared reconciliation outbox rows
 * are deliberately not removed because they are scoped to studio/root event,
 * not to one Google connection.
 */
export async function runGoogleCalendarDisconnectLifecycle(lifecycle: GoogleCalendarDisconnectLifecycle) {
  let remoteCalendar: "authorization_unavailable" | "deleted" | "missing" = "deleted";
  try {
    await lifecycle.deleteRemoteCalendar();
  } catch (error) {
    const failureClass = classifyGoogleCalendarDeleteFailure(error);
    if (failureClass === "retryable" || failureClass === "unknown") throw error;
    remoteCalendar = failureClass;
    lifecycle.reportIgnoredFailure?.("calendar_delete", error);
  }

  await lifecycle.removeMappings();

  try {
    await lifecycle.revokeCredentials();
  } catch (error) {
    lifecycle.reportIgnoredFailure?.("credential_revoke", error);
  }

  await lifecycle.removeConnection();
  return { remoteCalendar };
}
