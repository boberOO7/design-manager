import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import type { NotificationItem } from "@/data/queries/notifications";
import { formatNotificationRelativeTime, getNotificationPresentation, type NotificationTranslator } from "@/lib/notification-presentation";

const source = readFileSync(new URL("../components/layout/notification-bell.tsx", import.meta.url), "utf8");

function item(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: "notification-id",
    notification_type: "task_assigned",
    title: "Stored English fallback",
    body: "Stored English fallback",
    href: "/dashboard",
    metadata: {},
    read_at: null,
    created_at: "2026-09-08T08:00:00Z",
    actorName: null,
    ...overrides,
  };
}

function presentation(locale: "en" | "uk", notification: NotificationItem) {
  const messages = locale === "en" ? en : uk;
  const translator = createTranslator({ locale, messages, namespace: "Notifications" });
  const t: NotificationTranslator = (key, values) => translator(key, values);
  return getNotificationPresentation(notification, locale, t);
}

describe("notification panel localization", () => {
  it("localizes a new Meta lead while retaining its actual name", () => {
    const notification = item({ notification_type: "meta_lead_created", metadata: { leadName: "Наталія", source: "facebook" } });
    expect(presentation("uk", notification)).toEqual({ title: "Новий лід із Meta", body: "Новий клієнт: Наталія." });
    expect(presentation("en", notification)).toEqual({ title: "New lead from Meta", body: "New client: Наталія." });
    expect(presentation("uk", { ...notification, metadata: {} }).body).toBe("Перегляньте нового ліда у CRM.");
  });
  it("keeps the complete English and Ukrainian notification namespaces in parity", () => {
    expect(Object.keys(en.Notifications).sort()).toEqual(Object.keys(uk.Notifications).sort());
  });

  it("opens on Unread and localizes all panel chrome", () => {
    expect(source).toContain('useState<"all" | "unread">("unread")');
    expect(source).toContain('setFilter("unread")');
    for (const key of ["title", "bellLabel", "unreadCount", "close", "filterLabel", "all", "unread", "markAllAsRead", "allCaughtUp", "noNotifications"] as const) {
      expect(en.Notifications[key]).toBeTruthy();
      expect(uk.Notifications[key]).toBeTruthy();
    }
    expect(source).not.toContain('title="Notifications"');
    expect(source).not.toContain('label: "All"');
    expect(source).not.toContain('label: "Unread"');
    expect(source).not.toContain(">Mark all as read<");
  });

  it("renders structured office status notifications in English and Ukrainian without translating the assignment name", () => {
    const notification = item({
      notification_type: "office_assignment_status_changed",
      title: "Office assignment updated",
      body: "“Restock Pantone books” is now done.",
      metadata: { subject: "Restock Pantone books", status: "done" },
    });

    expect(presentation("en", notification)).toEqual({
      title: "Office assignment updated",
      body: "“Restock Pantone books” is now done.",
    });
    expect(presentation("uk", notification)).toEqual({
      title: "Офісне доручення оновлено",
      body: "«Restock Pantone books»: новий статус — виконано.",
    });
  });

  it("localizes a structured day-off request, including its date, while preserving the requester name", () => {
    const notification = item({
      notification_type: "time_off_request_submitted",
      title: "New time-off request",
      body: "Oksana Petrenko requested Day Off for Sep 3.",
      actorName: "Oksana Petrenko",
      metadata: { requestType: "day_off", startDate: "2026-09-03", endDate: "2026-09-03", requesterName: "Oksana Petrenko" },
    });

    expect(presentation("en", notification)).toEqual({
      title: "New time-off request",
      body: "Oksana Petrenko requested Day Off for Sep 3.",
    });
    expect(presentation("uk", notification)).toEqual({
      title: "Новий запит на відсутність",
      body: "Oksana Petrenko подав(-ла) запит «Відгул» на 3 вер.",
    });
  });

  it("localizes a Lead follow-up reminder while preserving the client name", () => {
    const notification = item({
      notification_type: "crm_lead_follow_up",
      title: "Lead follow-up reminder",
      body: "Reminder: contact Vasyl.",
      metadata: { leadName: "Vasyl", contactDate: "2026-09-10" },
    });
    expect(presentation("en", notification)).toEqual({ title: "Lead follow-up reminder", body: "Reminder: contact Vasyl." });
    expect(presentation("uk", notification)).toEqual({ title: "Нагадування про контакт із лідом", body: "Нагадування: зв'язатися з Vasyl." });
  });

  it("localizes equipment maintenance thresholds while preserving equipment identity", () => {
    const notification = item({
      notification_type: "equipment_maintenance_overdue",
      title: "Equipment maintenance overdue",
      body: "Render PC was due for maintenance.",
      metadata: { equipmentName: "Render PC", dueDate: "2026-09-10", threshold: "overdue" },
    });
    expect(presentation("en", notification)).toEqual({ title: "Equipment maintenance overdue", body: "Render PC was due for maintenance on Sep 10." });
    expect(presentation("uk", notification)).toEqual({ title: "Обслуговування обладнання прострочено", body: "Обладнання «Render PC» потрібно було обслужити 10 вер." });
  });

  it("localizes complaint and request labels but preserves their user-authored subjects", () => {
    const complaint = item({
      notification_type: "submission_created",
      title: "New complaint",
      body: "Anonymous: “Kitchen noise after 18:00”",
      metadata: { type: "complaint", anonymous: true, subject: "Kitchen noise after 18:00" },
    });
    const request = item({
      notification_type: "submission_status_changed",
      title: "Submission updated",
      body: "“Figma Enterprise seats” is now in progress.",
      metadata: { type: "request", status: "in_progress", subject: "Figma Enterprise seats" },
    });

    expect(presentation("uk", complaint)).toEqual({
      title: "Нова скарга",
      body: "Анонімно: «Kitchen noise after 18:00»",
    });
    expect(presentation("uk", request)).toEqual({
      title: "Запит оновлено",
      body: "«Figma Enterprise seats»: новий статус — у роботі.",
    });
  });

  it("translates the system fragments of compatible legacy task rows", () => {
    const legacy = item({
      notification_type: "task_assigned",
      title: "New task assigned",
      body: "You were added to “Concept design” in River House.",
      metadata: {},
    });

    expect(presentation("uk", legacy)).toEqual({
      title: "Нове призначене завдання",
      body: "Вас додано до завдання «Concept design» у проєкті River House.",
    });
  });

  it("localizes review requests with the round number and preserves task and project names", () => {
    const notification = item({
      notification_type: "task_review_requested",
      metadata: { subject: "Concept design", projectName: "River House", roundNumber: 2 },
    });
    expect(presentation("en", notification)).toEqual({
      title: "Task ready for your review",
      body: "Review #2: “Concept design” in River House is waiting for your review.",
    });
    expect(presentation("uk", notification)).toEqual({
      title: "Задача очікує вашої перевірки",
      body: "Review #2: завдання «Concept design» у проєкті River House очікує вашої перевірки.",
    });
    expect(presentation("uk", { ...notification, metadata: {} }).body).toBe(notification.body);
  });

  it.each([
    { type: "task_review_approved", metadata: { subject: "Concept design", projectName: "River House", isFinal: false, comment: "Do not show an approval comment" }, en: { title: "Review step approved", body: "A reviewer approved a step for “Concept design” in River House." }, uk: { title: "Проміжне схвалення завдання", body: "Перевіряючий схвалив один з етапів для завдання «Concept design» у проєкті River House." } },
    { type: "task_review_approved", metadata: { subject: "Concept design", projectName: "River House", isFinal: true }, en: { title: "Task review approved", body: "Review of “Concept design” in River House was approved." }, uk: { title: "Завдання схвалено після перевірки", body: "Перевірку завдання «Concept design» у проєкті River House схвалено." } },
    { type: "task_review_approved", metadata: { subject: "Concept design", projectName: "River House", correctionId: "cycle-1", isFinal: false }, en: { title: "Correction review step approved", body: "A reviewer approved a step for the correction to “Concept design” in River House." }, uk: { title: "Проміжне схвалення виправлення", body: "Перевіряючий схвалив один з етапів виправлення завдання «Concept design» у проєкті River House." } },
    { type: "task_review_approved", metadata: { subject: "Concept design", projectName: "River House", correctionId: "cycle-1", isFinal: true }, en: { title: "Correction review approved", body: "Review of the correction to “Concept design” in River House was approved." }, uk: { title: "Виправлення схвалено після перевірки", body: "Перевірку виправлення завдання «Concept design» у проєкті River House схвалено." } },
    { type: "task_rework_requested", metadata: { subject: "Concept design", projectName: "River House", comment: "Move the entry" }, en: { title: "Changes requested on task", body: "Changes were requested for “Concept design” in River House.\n\nMove the entry" }, uk: { title: "Потрібні правки до завдання", body: "Для завдання «Concept design» у проєкті River House потрібні правки.\n\nMove the entry" } },
    { type: "task_rework_requested", metadata: { subject: "Concept design", projectName: "River House", correctionId: "cycle-1" }, en: { title: "Changes requested on correction", body: "Changes were requested for the correction to “Concept design” in River House." }, uk: { title: "Потрібні правки до виправлення", body: "Для виправлення завдання «Concept design» у проєкті River House потрібні правки." } },
    { type: "task_completed", metadata: { subject: "Concept design", projectName: "River House" }, en: { title: "Task completed", body: "“Concept design” in River House was completed." }, uk: { title: "Завдання завершено", body: "Завдання «Concept design» у проєкті River House завершено." } },
  ] as const)("localizes task workflow event $type", ({ type, metadata, en, uk }) => {
    const notification = item({ notification_type: type, metadata });
    expect(presentation("en", notification)).toEqual(en);
    expect(presentation("uk", notification)).toEqual(uk);
  });

  it("translates compatible legacy time-off rows without changing the requester name", () => {
    const legacy = item({
      notification_type: "time_off_request_submitted",
      title: "New time-off request",
      body: "Oksana Petrenko requested Day Off for Sep 3.",
      actorName: "Oksana Petrenko",
      metadata: {},
    });

    expect(presentation("uk", legacy)).toEqual({
      title: "Новий запит на відсутність",
      body: "Oksana Petrenko подав(-ла) запит «Відгул» на 3 вер.",
    });
  });

  it("formats relative timestamps with the active locale", () => {
    const now = Date.parse("2026-09-08T09:00:00Z");
    expect(formatNotificationRelativeTime("2026-09-08T08:55:00Z", "en", now)).toContain("5m");
    expect(formatNotificationRelativeTime("2026-09-08T08:55:00Z", "uk", now)).toContain("5 хв");
  });
});
