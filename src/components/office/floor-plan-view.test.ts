import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const floorPlan = readFileSync("src/components/office/floor-plan-view.tsx", "utf8");
const workspace = readFileSync("src/components/office/equipment-workspace.tsx", "utf8");
const query = readFileSync("src/data/queries/equipment.ts", "utf8");
const actions = readFileSync("src/app/(app)/office/equipment/actions.ts", "utf8");

describe("Office floor-plan application flow", () => {
  it("keeps Cards and Floor plan inside the existing Workstations view", () => {
    expect(workspace).toContain('["cards", "floorPlan"]');
    expect(workspace).toContain('layout=${view === "floorPlan" ? "floor-plan" : "cards"}');
    expect(workspace).toContain("<FloorPlanView");
  });

  it("renders both source SVGs beneath a normalized interactive overlay", () => {
    expect(floorPlan).toContain('src: "/floor-1.svg"');
    expect(floorPlan).toContain('src: "/floor-2.svg"');
    expect(floorPlan).toContain("<image href={plan.src}");
    expect(floorPlan).toContain("placement.x * plan.width");
    expect(floorPlan).toContain("placement.y * plan.height");
  });

  it("excludes remote workstations and small equipment from placement", () => {
    expect(floorPlan).toContain('item.workstationType !== "office"');
    expect(floorPlan).toContain("isOtherEquipment(item.equipmentType)");
  });

  it("supports native pan, zoom, drag, floor moves, removal, and atomic save", () => {
    for (const behavior of ["handleWheel", "handlePointerMove", "dragKeyRef", "updatePlacement", "setDraft((current) => current.filter", "saveFloorPlanLayout"]) expect(floorPlan).toContain(behavior);
    expect(actions).toContain('rpc("save_office_floor_plan_layout"');
    expect(query).toContain('from("office_floor_plan_placements")');
    expect(floorPlan).not.toMatch(/three|dnd-kit/i);
  });

  it("adds native magnetic snapping, explicit wall guides, and a temporary bypass", () => {
    expect(floorPlan).toContain("snapFloorPlanRect");
    expect(floorPlan).toContain("walls: { x:");
    expect(floorPlan).toContain("data-snap-guide");
    expect(floorPlan).toContain("event.altKey");
    expect(floorPlan).toContain("FLOOR_PLAN_GRID_STEP");
  });

  it("persists restrained rotation and reusable type sizing in display metadata", () => {
    expect(floorPlan).toContain("nextFloorPlanRotation");
    expect(floorPlan).toContain('event.key.toLowerCase() === "r"');
    expect(floorPlan).toContain("rememberedSizes");
    expect(floorPlan).toContain("applySizeToKind");
    expect(floorPlan).toContain("metadataWithAppearance");
  });

  it("isolates wheel zoom, restores fit, and keeps the legend progressive", () => {
    expect(floorPlan).toContain('addEventListener("wheel", handleWheel, { passive: false })');
    expect(floorPlan).toContain("event.preventDefault()");
    expect(floorPlan).toContain("fitFloor");
    expect(floorPlan).toContain("<Popover.Root>");
  });

  it("opens the existing URL-driven workstation and equipment sheets", () => {
    expect(workspace).toContain("onOpenEquipment={routing.openItem}");
    expect(workspace).toContain("onOpenWorkstation={routing.openItem}");
  });
});
