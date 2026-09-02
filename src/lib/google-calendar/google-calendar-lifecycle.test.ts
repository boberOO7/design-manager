import { describe, expect, it, vi } from "vitest";
import {
  classifyGoogleCalendarDeleteFailure,
  googleCalendarName,
  GoogleCalendarAuthorizationUnavailableError,
  runGoogleCalendarDisconnectLifecycle,
} from "@/lib/google-calendar/lifecycle";

function googleFailure(status: number, reason: string, message: string) {
  return {
    response: {
      status,
      data: { error: { code: status, errors: [{ reason }], message } },
    },
  };
}

describe("Google Calendar connection lifecycle", () => {
  it("derives the app-owned calendar name from the canonical studio name", () => {
    expect(googleCalendarName("SPACE")).toBe("SPACE Team");
    expect(googleCalendarName("  Київська студія  ")).toBe("Київська студія Team");
  });

  it("deletes the remote calendar before mappings, revocation, and connection cleanup", async () => {
    const operations: string[] = [];
    await expect(runGoogleCalendarDisconnectLifecycle({
      deleteRemoteCalendar: async () => { operations.push("calendar"); },
      removeMappings: async () => { operations.push("mappings"); },
      revokeCredentials: async () => { operations.push("revoke"); },
      removeConnection: async () => { operations.push("connection"); },
    })).resolves.toEqual({ remoteCalendar: "deleted" });
    expect(operations).toEqual(["calendar", "mappings", "revoke", "connection"]);
  });

  it("continues local cleanup when the persisted remote calendar is already missing", async () => {
    const operations: string[] = [];
    await expect(runGoogleCalendarDisconnectLifecycle({
      deleteRemoteCalendar: async () => {
        operations.push("calendar");
        throw googleFailure(404, "notFound", "Not Found");
      },
      removeMappings: async () => { operations.push("mappings"); },
      revokeCredentials: async () => { operations.push("revoke"); },
      removeConnection: async () => { operations.push("connection"); },
    })).resolves.toEqual({ remoteCalendar: "missing" });
    expect(operations).toEqual(["calendar", "mappings", "revoke", "connection"]);
  });

  it("allows local disconnect when credentials are revoked or unavailable", async () => {
    const operations: string[] = [];
    const ignored = vi.fn();
    await expect(runGoogleCalendarDisconnectLifecycle({
      deleteRemoteCalendar: async () => {
        operations.push("calendar");
        throw new GoogleCalendarAuthorizationUnavailableError("Stored Google authorization is unavailable.");
      },
      removeMappings: async () => { operations.push("mappings"); },
      revokeCredentials: async () => {
        operations.push("revoke");
        throw new Error("invalid_grant");
      },
      removeConnection: async () => { operations.push("connection"); },
      reportIgnoredFailure: ignored,
    })).resolves.toEqual({ remoteCalendar: "authorization_unavailable" });
    expect(operations).toEqual(["calendar", "mappings", "revoke", "connection"]);
    expect(ignored).toHaveBeenCalledTimes(2);
  });

  it("preserves local state when Google calendar deletion has a transient failure", async () => {
    const operations: string[] = [];
    const failure = googleFailure(503, "backendError", "Backend unavailable");
    await expect(runGoogleCalendarDisconnectLifecycle({
      deleteRemoteCalendar: async () => {
        operations.push("calendar");
        throw failure;
      },
      removeMappings: async () => { operations.push("mappings"); },
      revokeCredentials: async () => { operations.push("revoke"); },
      removeConnection: async () => { operations.push("connection"); },
    })).rejects.toBe(failure);
    expect(classifyGoogleCalendarDeleteFailure(failure)).toBe("retryable");
    expect(operations).toEqual(["calendar"]);
  });
});
