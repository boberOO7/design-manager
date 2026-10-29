import { z } from "zod";
import { workDirectionInputSchema, type DirectionKind } from "./work-directions";

export const projectCreationDirectionsSchema = z.array(workDirectionInputSchema.refine(input =>
  input.intent === "save" && input.id === undefined && input.kind != null,
));

export type ProjectCreationDirectionDraft = {
  key: string;
  kind: DirectionKind;
  name: string;
  nameEdited: boolean;
  area: string;
  coefficient: string;
  templateId: string;
};

export function creationDirectionInput(draft: ProjectCreationDirectionDraft) {
  return {
    intent: "save" as const,
    kind: draft.kind,
    name: draft.name,
    useDefaultName: !draft.nameEdited,
    areaM2: Number(draft.area),
    coefficient: Number(draft.coefficient),
    templateId: draft.templateId,
  };
}

export function parseCreationDirections(value: FormDataEntryValue | null) {
  try {
    return projectCreationDirectionsSchema.safeParse(value === null ? [] : typeof value === "string" ? JSON.parse(value) : null);
  } catch {
    return projectCreationDirectionsSchema.safeParse(null);
  }
}
