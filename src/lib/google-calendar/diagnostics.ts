export type DiagnosticContext = {
  connectionId?: string;
  rootEventId?: string;
  sourceEventId?: string;
  studioId?: string;
  userId?: string;
};

export type GoogleCalendarFailureDiagnostic = DiagnosticContext & {
  stage: string;
  operation: string;
  message: string;
  httpStatus?: number;
  code?: string;
  reason?: string;
};

const MAX_MESSAGE_LENGTH = 400;
const REDACTED_FIELD = /(authorization|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|encryption[_ -]?key)\s*[:=]\s*[^\s,;]+/gi;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function sanitizeGoogleCalendarErrorMessage(value: unknown): string {
  const raw = value instanceof Error
    ? value.message
    : text(value) ?? text(record(value)?.message) ?? "Unknown reconciliation failure.";
  return raw
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(REDACTED_FIELD, "$1=[REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, MAX_MESSAGE_LENGTH);
}

function extractFailureFields(error: unknown) {
  const outer = record(error);
  const response = record(outer?.response);
  const responseData = record(response?.data);
  const googleError = record(responseData?.error);
  const googleErrors = Array.isArray(googleError?.errors) ? googleError.errors : [];
  const firstGoogleError = record(googleErrors[0]);
  const cause = error instanceof Error ? error.cause : undefined;
  const causeRecord = record(cause);

  const status = number(response?.status)
    ?? number(outer?.status)
    ?? number(outer?.statusCode)
    ?? number(causeRecord?.status)
    ?? number(causeRecord?.statusCode);
  const rawCode = googleError?.code ?? outer?.code ?? causeRecord?.code;
  const code = typeof rawCode === "number" ? String(rawCode) : text(rawCode);
  const rawReason = text(firstGoogleError?.reason)
    ?? text(googleError?.status)
    ?? text(responseData?.error_description)
    ?? text(causeRecord?.details);
  const message = text(googleError?.message)
    ?? text(responseData?.error_description)
    ?? text(responseData?.error)
    ?? text(outer?.message)
    ?? text(causeRecord?.message)
    ?? text(outer?.details)
    ?? text(outer?.hint)
    ?? (code === "42501" ? "Database role lacks a required table privilege." : undefined)
    ?? "Unknown reconciliation failure.";

  return {
    code,
    httpStatus: status,
    message: sanitizeGoogleCalendarErrorMessage(message),
    reason: rawReason ? sanitizeGoogleCalendarErrorMessage(rawReason) : undefined,
  };
}

export class GoogleCalendarSyncError extends Error {
  readonly diagnostic: GoogleCalendarFailureDiagnostic;

  constructor(stage: string, operation: string, error: unknown, context: DiagnosticContext = {}) {
    const fields = extractFailureFields(error);
    super(fields.message, { cause: error });
    this.name = "GoogleCalendarSyncError";
    this.diagnostic = { stage, operation, ...fields, ...context };
  }
}

export function asGoogleCalendarSyncError(
  stage: string,
  operation: string,
  error: unknown,
  context: DiagnosticContext = {},
): GoogleCalendarSyncError {
  return error instanceof GoogleCalendarSyncError
    ? error
    : new GoogleCalendarSyncError(stage, operation, error, context);
}

export async function atGoogleCalendarStage<T>(
  stage: string,
  operation: string,
  context: DiagnosticContext,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw asGoogleCalendarSyncError(stage, operation, error, context);
  }
}

export function getGoogleCalendarFailureDiagnostic(error: unknown): GoogleCalendarFailureDiagnostic {
  return error instanceof GoogleCalendarSyncError
    ? error.diagnostic
    : new GoogleCalendarSyncError("unknown", "unknown", error).diagnostic;
}

export function logGoogleCalendarFailure(error: unknown, context: DiagnosticContext = {}) {
  const diagnostic = getGoogleCalendarFailureDiagnostic(error);
  console.error("Google Calendar reconciliation failed", JSON.stringify({ ...context, ...diagnostic }));
}

export function googleCalendarJobLastError(error: unknown, exhausted: boolean): string {
  const diagnostic = getGoogleCalendarFailureDiagnostic(error);
  const fields = [
    `${diagnostic.stage}/${diagnostic.operation}`,
    diagnostic.message,
    diagnostic.httpStatus ? `status=${diagnostic.httpStatus}` : null,
    diagnostic.code ? `code=${diagnostic.code}` : null,
    diagnostic.reason ? `reason=${sanitizeGoogleCalendarErrorMessage(diagnostic.reason)}` : null,
  ].filter((value): value is string => Boolean(value));
  const suffix = exhausted ? "bounded retries exhausted" : "retry scheduled";
  return `${fields.join("; ")}; ${suffix}`.slice(0, 900);
}
