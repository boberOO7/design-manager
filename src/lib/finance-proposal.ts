import { z } from "zod";
import { projectAreaValue, projectMoneyUnits } from "./finance-project-plan";

export function parseProjectNumber(name: string): string | null {
  return name.trim().match(/^(\d+)(?:[\s_–—-]|$)/u)?.[1] ?? null;
}
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
export const studioContactDetailsSchema = z.object({
  website: z.string().trim().max(300).pipe(z.union([z.literal(""), z.url({protocol: /^https?$/})])),
  email: z.string().trim().max(254).pipe(z.union([z.literal(""), z.email()])),
  phone: z.string().trim().max(100), businessAddress: z.string().trim().max(500),
});
export type StudioContactDetails = z.infer<typeof studioContactDetailsSchema>;
export const proposalPresentationSchema = z.object({
  projectTitle: z.string().trim().min(1).max(500), clientName: z.string().trim().max(500),
  contact: z.string().trim().max(1000), address: z.string().trim().max(1000), intro: z.string().trim().max(1000),
  studioContacts: z.string().trim().max(300).optional(),
});
export const proposalSnapshotSchema = proposalPresentationSchema.extend({
  schemaVersion: z.literal(1), projectId: z.uuid(), projectNumber: z.string().regex(/^\d+$/),
  revision: z.number().int().positive(), date: z.iso.date(), area: decimal.nullable(),
  clientRatePerM2: decimal.nullable().optional(),
  studioContactDetails: studioContactDetailsSchema.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/), minorUnits: z.number().int().min(0).max(4),
  gross: decimal, vatRate: decimal.nullable(), vatAmount: decimal,
  rows: z.array(z.object({ id: z.uuid(), name: z.string(), percentage: decimal, gross: decimal, note: z.string().max(300) })),
});
export type ProposalSnapshot = z.infer<typeof proposalSnapshotSchema>;
export type ProposalPresentation = z.infer<typeof proposalPresentationSchema>;

// Parsing copies the allowlisted client data, never retaining mutable source references.
export function createProposalSnapshot(source: unknown, presentation: unknown): ProposalSnapshot {
  return proposalSnapshotSchema.parse({ ...proposalSnapshotSchema.parse(source), ...proposalPresentationSchema.parse(presentation) });
}
export function proposalPresentation(source: ProposalSnapshot): ProposalPresentation {
  return proposalPresentationSchema.parse(source);
}
export function proposalFilename(snapshot: Pick<ProposalSnapshot, "projectNumber" | "revision">) {
  return `SPACE-${snapshot.projectNumber}-r${snapshot.revision}.pdf`;
}

export function proposalPriceBasis(s: Pick<ProposalSnapshot, "area" | "clientRatePerM2" | "gross" | "currency" | "minorUnits">): string | null {
  if (!s.area || !s.clientRatePerM2) return null;
  // VAT rounded for the whole agreement can differ from a rounded tariff per m².
  const approximate = projectMoneyUnits(projectAreaValue(s.area, s.clientRatePerM2, s.minorUnits), s.minorUnits) !== projectMoneyUnits(s.gross, s.minorUnits);
  const format = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 4 });
  return `${format.format(Number(s.area))} м² × ${approximate ? "≈ " : ""}${format.format(Number(s.clientRatePerM2))} ${s.currency}/м²`;
}
