import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import { Constants } from "@/types/database.types";
import { getWebPushPreview } from "./preview";

describe("privacy-safe Web Push previews", () => {
  it.each(["uk", "en"])("covers every existing notification category in %s, even without metadata", locale => {
    for (const notification_type of Constants.public.Enums.notification_type) {
      const preview = getWebPushPreview({ notification_type, metadata: {} }, locale);
      expect(preview.title).not.toBe("StudioFlow");
      expect(preview.body).toBeTruthy();
      expect(preview.title).not.toContain("Notifications.");
      expect(Array.from(preview.title).length).toBeLessThanOrEqual(64);
      expect(Array.from(preview.body).length).toBeLessThanOrEqual(160);
    }
  });

  it.each([
    { type: "task_assigned", metadata: { subject: "План кухні", projectName: "Квартира" }, title: "Нове призначене завдання", body: "«План кухні» · Квартира" },
    { type: "task_assigned", metadata: { subject: "План кухні", assignmentKind: "collaborator" }, title: "Вас додано до завдання", body: "«План кухні»" },
    { type: "task_review_requested", metadata: { subject: "План кухні", projectName: "Квартира", roundNumber: 2 }, title: "Задача очікує вашої перевірки", body: "«План кухні» · Квартира" },
    { type: "task_details_changed", metadata: { subject: "План кухні", change: "due_date" }, title: "Дедлайн завдання змінено", body: "«План кухні»" },
    { type: "calendar_event_invitation", metadata: { eventTitle: "Зустріч із командою", projectName: "Квартира" }, title: "Запрошення на подію", body: "«Зустріч із командою» · Квартира" },
    { type: "calendar_event_updated", metadata: { eventTitle: "Зустріч із командою" }, title: "Подію оновлено", body: "«Зустріч із командою»" },
    { type: "office_assignment_status_changed", metadata: { subject: "Private business details", status: "done" }, title: "Офісне доручення оновлено", body: "Статус: виконано. Деталі у StudioFlow." },
    { type: "equipment_maintenance_overdue", metadata: { equipmentName: "Принтер", cost: 9999 }, title: "Обслуговування обладнання прострочено", body: "«Принтер»" },
  ])("formats $type concisely from existing metadata", ({ type, metadata, title, body }) => {
    expect(getWebPushPreview({ notification_type: type, metadata }, "uk", true)).toEqual({ title, body });
  });

  it("localizes context and approvals in English", () => {
    expect(getWebPushPreview({ notification_type: "task_assigned", metadata: { subject: "Kitchen plan", projectName: "Apartment" } }, "en")).toEqual({ title: "New task assigned", body: "“Kitchen plan” · Apartment" });
    expect(getWebPushPreview({ notification_type: "time_off_request_approved", metadata: { requesterName: "Private name", requestType: "sick_leave", startDate: "2026-10-12" } }, "en")).toEqual({ title: "Time off approved", body: "View request details in StudioFlow." });
  });

  it.each([
    "time_off_request_submitted", "time_off_request_approved", "time_off_request_rejected", "time_off_request_cancelled",
    "submission_created", "submission_assigned", "submission_status_changed", "crm_lead_follow_up",
    "office_assignment_assigned", "office_assignment_status_changed", "calendar_event_invitation",
  ])("does not expose sensitive metadata for %s", notification_type => {
    const preview = getWebPushPreview({ notification_type, metadata: { subject: "SECRET", eventTitle: "SECRET", projectName: "SECRET", leadName: "SECRET", requesterName: "SECRET", authorName: "SECRET", requestType: "sick_leave", startDate: "2026-10-12", location: "SECRET", notes: "SECRET", amount: 9999, type: "complaint" } }, "uk");
    expect(JSON.stringify(preview)).not.toMatch(/SECRET|9999|2026-10-12|sick_leave/);
  });

  it("falls back safely for unknown types, malformed metadata and unknown status values", () => {
    expect(getWebPushPreview({ notification_type: "future_finance_notification", metadata: { subject: "SECRET", amount: 9999 } }, "uk")).toEqual({ title: "StudioFlow", body: "У вас нове сповіщення у StudioFlow." });
    for (const metadata of [null, [], "SECRET", { subject: "  " }]) {
      expect(getWebPushPreview({ notification_type: "task_assigned", metadata }, "uk").body).toBe("Перегляньте завдання у StudioFlow.");
    }
    expect(getWebPushPreview({ notification_type: "office_assignment_status_changed", metadata: { status: "SECRET" } }, "uk").body).toBe("Перегляньте доручення у StudioFlow.");
  });

  it("keeps long multiline context within banner limits while retaining the project", () => {
    const preview = getWebPushPreview({ notification_type: "task_assigned", metadata: { subject: "🖼️ План\n".repeat(100), projectName: "Квартира".repeat(100) } }, "uk");
    expect(Array.from(preview.body).length).toBeLessThanOrEqual(160);
    expect(preview.body).toContain("· Квартира");
    expect(preview.body).not.toContain("\n");
    expect(preview.body).toContain("…");
  });

  it("keeps both notification translation namespaces and interpolation parameters consistent", () => {
    expect(Object.keys(en.Notifications).sort()).toEqual(Object.keys(uk.Notifications).sort());
    for (const [key, message] of Object.entries(en.Notifications)) {
      if (!key.startsWith("push")) continue;
      const ukrainian = Object.entries(uk.Notifications).find(([name]) => name === key)?.[1] ?? "";
      expect(message.match(/\{\w+\}/g)?.sort() ?? []).toEqual(ukrainian.match(/\{\w+\}/g)?.sort() ?? []);
    }
  });
});
