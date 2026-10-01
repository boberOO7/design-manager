import { z } from "zod";
import { projectAreaValue, projectMoneyUnits } from "./finance-project-plan";

export const proposalDesignVariants = [
  { value: "measured-space", label: "Measured Space" },
  { value: "quiet-monument", label: "Quiet Monument" },
  { value: "folded-plane", label: "Folded Plane" },
] as const;
export type ProposalConceptVariant = typeof proposalDesignVariants[number]["value"];
export const proposalDesignVariantSchema = z.enum(["classic", "measured-space", "quiet-monument", "folded-plane"]);
export type ProposalDesignVariant = z.infer<typeof proposalDesignVariantSchema>;
// The pre-existing production layout remains the default for first drafts and legacy snapshots.
export const DEFAULT_PROPOSAL_DESIGN_VARIANT: ProposalDesignVariant = "classic";

export function parseProjectNumber(name: string): string | null {
  return parseProposalProjectName(name).number;
}
export function parseProposalProjectName(name: string) {
  const trimmed = name.trim(), prefix = trimmed.match(/^(\d+)(?:[\s_–—\-]+|$)/u);
  return { number: prefix?.[1] ?? null, title: prefix ? trimmed.slice(prefix[0].length) || trimmed : trimmed };
}
export function studioWebsiteDisplay(website: string) {
  return website.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/iu, "").replace(/\/$/u, "");
}
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
export const studioContactDetailsSchema = z.object({
  website: z.string().trim().max(300).pipe(z.union([z.literal(""), z.url({protocol: /^https?$/})])),
  email: z.string().trim().max(254).pipe(z.union([z.literal(""), z.email()])),
  phone: z.string().trim().max(100), businessAddress: z.string().trim().max(500),
  contactPerson: z.string().trim().max(200).optional(),
});
export type StudioContactDetails = z.infer<typeof studioContactDetailsSchema>;
// Studio storage and proposal snapshots retain URLs; only editor/API input accepts bare domains.
export const studioContactDetailsInputSchema = studioContactDetailsSchema.extend({
  website: z.string().trim().max(300).transform(value => !value || /^[a-z][a-z\d+.-]*:/iu.test(value) ? value : `https://${value}`).pipe(studioContactDetailsSchema.shape.website),
});
export const proposalPresentationSchema = z.object({
  projectTitle: z.string().trim().min(1).max(500), clientName: z.string().trim().max(500),
  contact: z.string().trim().max(1000), address: z.string().trim().max(1000), intro: z.string().trim().max(1000),
  studioContacts: z.string().trim().max(300).optional(),
  designVariant: proposalDesignVariantSchema.optional(),
  // Presentation override; the generated snapshot freezes it in studioContactDetails.
  studioContactPerson: z.string().trim().max(200).optional(),
});
export const proposalSnapshotSchema = proposalPresentationSchema.omit({ studioContactPerson: true }).extend({
  schemaVersion: z.literal(1), projectId: z.uuid(), projectNumber: z.string().regex(/^\d+$/),
  revision: z.number().int().positive(), date: z.iso.date(), area: decimal.nullable(),
  clientRatePerM2: decimal.nullable().optional(),
  studioContactDetails: studioContactDetailsSchema.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/), minorUnits: z.number().int().min(0).max(4),
  gross: decimal, vatRate: decimal.nullable(), vatAmount: decimal,
  pricing: z.object({
    listAmount: decimal, priceBasis: z.enum(["net", "gross"]).nullable(),
    discountType: z.enum(["none", "percentage", "fixed"]), discountValue: decimal, discountAmount: decimal,
    agreedAmount: decimal, net: decimal, listGross: decimal, discountGross: decimal,
  }).optional(),
  rows: z.array(z.object({ id: z.uuid(), name: z.string(), percentage: decimal, gross: decimal, note: z.string().max(300) })),
});
export type ProposalSnapshot = z.infer<typeof proposalSnapshotSchema>;
export type ProposalPresentation = z.infer<typeof proposalPresentationSchema>;

export function resolveProposalDesignVariant(snapshot: Pick<ProposalSnapshot, "designVariant">): ProposalDesignVariant {
  return snapshot.designVariant ?? DEFAULT_PROPOSAL_DESIGN_VARIANT;
}

// Parsing copies the allowlisted client data, never retaining mutable source references.
export function createProposalSnapshot(source: unknown, presentation: unknown): ProposalSnapshot {
  const snapshot = proposalSnapshotSchema.parse(source);
  const { studioContactPerson, ...fields } = proposalPresentationSchema.parse(presentation);
  return proposalSnapshotSchema.parse({ ...snapshot, ...fields,
    ...(studioContactPerson !== undefined && snapshot.studioContactDetails ? {
      studioContactDetails: { ...snapshot.studioContactDetails, contactPerson: studioContactPerson },
    } : {}),
  });
}
export function proposalPresentation(source: ProposalSnapshot): ProposalPresentation {
  return proposalPresentationSchema.parse({ ...source, studioContactPerson: source.studioContactDetails?.contactPerson });
}
export function proposalFilename(snapshot: Pick<ProposalSnapshot, "projectNumber" | "revision">) {
  return `SPACE-${snapshot.projectNumber}-r${snapshot.revision}.pdf`;
}

export function proposalPriceBasis(s: Pick<ProposalSnapshot, "area" | "clientRatePerM2" | "gross" | "currency" | "minorUnits" | "pricing">): string | null {
  if (!s.area || !s.clientRatePerM2) return null;
  // VAT rounded for the whole agreement can differ from a rounded tariff per m².
  const approximate = projectMoneyUnits(projectAreaValue(s.area, s.clientRatePerM2, s.minorUnits), s.minorUnits) !== projectMoneyUnits(s.pricing?.listGross ?? s.gross, s.minorUnits);
  const format = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 4 });
  return `${format.format(Number(s.area))} м² × ${approximate ? "≈ " : ""}${format.format(Number(s.clientRatePerM2))} ${s.currency}/м²`;
}
