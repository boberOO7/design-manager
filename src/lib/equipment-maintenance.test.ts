import { describe, expect, it } from "vitest";
import { getMaintenanceUrgency } from "@/lib/equipment";

describe("equipment maintenance urgency", () => {
  it("uses inclusive 30-day upcoming and strict overdue boundaries", () => {
    expect(getMaintenanceUrgency(true, "2026-09-10", "2026-09-11")).toBe("overdue");
    expect(getMaintenanceUrgency(true, "2026-09-11", "2026-09-11")).toBe("upcoming");
    expect(getMaintenanceUrgency(true, "2026-10-11", "2026-09-11")).toBe("upcoming");
    expect(getMaintenanceUrgency(true, "2026-10-12", "2026-09-11")).toBeNull();
    expect(getMaintenanceUrgency(false, "2026-09-10", "2026-09-11")).toBeNull();
  });
});
