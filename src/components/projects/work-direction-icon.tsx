import { Building2, House, Layers3, PencilRuler, Sofa, Trees, type LucideIcon } from "lucide-react";
import { directionKindSchema, type DirectionKind } from "@/lib/work-directions";

const icons = { interior: Sofa, facade: Building2, landscape: Trees, architecture: PencilRuler, exterior: House, custom: Layers3 } satisfies Record<DirectionKind, LucideIcon>;

export function WorkDirectionIcon({ kind, className }: { kind: string | null; className?: string }) {
  const parsed = directionKindSchema.safeParse(kind);
  const Icon = parsed.success ? icons[parsed.data] : Layers3;
  return <Icon aria-hidden="true" className={className} strokeWidth={1.6} />;
}
