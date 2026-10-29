import { describe, expect, it } from "vitest";
import { parseCreationDirections } from "./project-creation-directions";

const direction = { intent: "save", kind: "facade", name: "Facade", areaM2: 200, coefficient: 0.35, templateId: "" };
describe("project creation directions", () => {
  it("preserves legacy callers and accepts valid new directions", () => {
    expect(parseCreationDirections(null).success).toBe(true);
    const result = parseCreationDirections(JSON.stringify([direction]));
    expect(result.success && result.data[0].areaM2).toBe(200);
  });
  it.each(["{", "null", "{}", JSON.stringify([{ ...direction, intent: "remove" }]), JSON.stringify([{ ...direction, id: "e9000000-0000-4000-8000-000000000001" }]), JSON.stringify([{ ...direction, kind: null }]), JSON.stringify([{ ...direction, areaM2: 0 }]), JSON.stringify([{ ...direction, coefficient: -1 }])])("rejects invalid or existing-direction mutations: %s", value => {
    expect(parseCreationDirections(value).success).toBe(false);
  });
});
