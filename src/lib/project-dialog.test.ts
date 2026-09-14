import { describe, expect, it } from "vitest";
import { getProjectDialogCloseIntent } from "./project-dialog";

describe("project form dialog dismissal", () => {
  it("closes dirty create forms without confirmation for every dismissal path", () => {
    expect(getProjectDialogCloseIntent("create", true, "explicit")).toBe("close");
    expect(getProjectDialogCloseIntent("create", true, "escape")).toBe("close");
    expect(getProjectDialogCloseIntent("create", true, "outside")).toBe("close");
  });

  it("preserves dirty edit-form protection", () => {
    expect(getProjectDialogCloseIntent("edit", true, "outside")).toBe("ignore");
    expect(getProjectDialogCloseIntent("edit", true, "explicit")).toBe("confirm");
    expect(getProjectDialogCloseIntent("edit", true, "escape")).toBe("confirm");
  });

  it("closes directly while clean", () => {
    expect(getProjectDialogCloseIntent("edit", false, "outside")).toBe("close");
  });
});
