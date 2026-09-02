import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGoogleCalendarFailureDiagnostic,
  googleCalendarJobLastError,
  GoogleCalendarSyncError,
  logGoogleCalendarFailure,
  sanitizeGoogleCalendarErrorMessage,
} from "@/lib/google-calendar/diagnostics";

describe("Google Calendar reconciliation diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts useful Google API fields without retaining request credentials", () => {
    const failure = new GoogleCalendarSyncError("google_projection.insert", "google.events.insert", {
      response: {
        status: 403,
        data: {
          error: {
            code: 403,
            message: "Rate limit exceeded",
            errors: [{ reason: "rateLimitExceeded" }],
          },
        },
      },
    }, { connectionId: "connection-id", rootEventId: "event-id" });

    expect(getGoogleCalendarFailureDiagnostic(failure)).toEqual({
      stage: "google_projection.insert",
      operation: "google.events.insert",
      message: "Rate limit exceeded",
      httpStatus: 403,
      code: "403",
      reason: "rateLimitExceeded",
      connectionId: "connection-id",
      rootEventId: "event-id",
    });
  });

  it("redacts credential-shaped values from messages and persisted job errors", () => {
    const message = sanitizeGoogleCalendarErrorMessage(
      "Authorization: Bearer secret-value refresh_token=another-secret request failed",
    );
    expect(message).not.toContain("secret-value");
    expect(message).not.toContain("another-secret");

    const failure = new GoogleCalendarSyncError("projection.load", "db.select.calendar_events", {
      code: "42501",
      message: "permission denied for table calendar_events",
    });
    expect(googleCalendarJobLastError(failure, false)).toContain(
      "projection.load/db.select.calendar_events; permission denied for table calendar_events; code=42501; retry scheduled",
    );
  });

  it("writes structured sanitized server diagnostics for Google failures", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new GoogleCalendarSyncError("google_projection.update", "google.events.update", {
      response: {
        status: 503,
        data: {
          error: {
            code: 503,
            message: "Backend unavailable; Authorization: Bearer secret-value",
            errors: [{ reason: "backendError" }],
          },
        },
      },
    }, { connectionId: "connection-id", sourceEventId: "event-id" });

    logGoogleCalendarFailure(failure, { studioId: "studio-id", userId: "user-id" });

    expect(consoleError).toHaveBeenCalledOnce();
    const serialized = String(consoleError.mock.calls[0]?.[1]);
    expect(serialized).toContain('"operation":"google.events.update"');
    expect(serialized).toContain('"httpStatus":503');
    expect(serialized).toContain('"code":"503"');
    expect(serialized).toContain('"reason":"backendError"');
    expect(serialized).toContain('"studioId":"studio-id"');
    expect(serialized).not.toContain("secret-value");
  });
});
