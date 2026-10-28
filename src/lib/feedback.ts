import { z } from "zod";
import type { Json, Database } from "@/types/database.types";
import { addCalendarDays, zonedWallTimeToIso } from "@/lib/calendar";

export const feedbackRatingKeys = ["satisfaction", "communication", "timeliness", "expectations", "recommendation"] as const;
export const feedbackTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export function getFeedbackSurveyPath(token: string) {
  feedbackTokenSchema.parse(token);
  const bytes = token.match(/.{2}/g) ?? [];
  const compact = btoa(String.fromCharCode(...bytes.map(byte => Number.parseInt(byte, 16))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `/f/${compact}`;
}

export function resolveFeedbackLinkToken(value: string): string | null {
  if (feedbackTokenSchema.safeParse(value).success) return value;
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const bytes = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=");
  const token = Array.from(bytes, byte => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  return getFeedbackSurveyPath(token) === `/f/${value}` ? token : null;
}

// Exclusive midnight after the selected day, using the application's Kyiv timezone.
export function getFeedbackExpiryAt(date: string): string | null {
  if (!z.iso.date().safeParse(date).success) return null;
  return zonedWallTimeToIso(`${addCalendarDays(date, 1)}T00:00`);
}
const rating = z.number().int().min(1).max(5);
export const feedbackResponseSchema = z.strictObject({
  satisfaction: rating,
  communication: rating,
  timeliness: rating,
  expectations: rating,
  recommendation: z.number().int().min(0).max(10),
  strengths: z.string().trim().max(2000),
  improvements: z.string().trim().max(2000),
  website: z.literal(""),
});
export type FeedbackInvitation = Database["public"]["Tables"]["project_feedback"]["Row"] & { version?: { config: Json; version: number } };
export type FeedbackSummary = Database["public"]["Functions"]["get_studio_feedback_summary"]["Returns"][number];
export function feedbackStatus(invitation: Pick<FeedbackInvitation, "submitted_at" | "revoked_at" | "expires_at">, now = Date.now()) {
  if (invitation.submitted_at) return "answered";
  if (invitation.revoked_at) return "revoked";
  if (Date.parse(invitation.expires_at) <= now) return "expired";
  return "pending";
}
