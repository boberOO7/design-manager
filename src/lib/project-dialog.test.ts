import { describe, expect, it } from "vitest";
import { getProjectDialogCloseIntent } from "./project-dialog";

describe("new project dialog dismissal", () => {
  it("ignores accidental outside dismissal after the form becomes dirty", () => {
    expect(getProjectDialogCloseIntent(true, "outside")).toBe("ignore");
  });

  it("requests confirmation for explicit and Escape dismissal when dirty", () => {
    expect(getProjectDialogCloseIntent(true, "explicit")).toBe("confirm");
    expect(getProjectDialogCloseIntent(true, "escape")).toBe("confirm");
  });

  it("closes directly while clean", () => {
    expect(getProjectDialogCloseIntent(false, "outside")).toBe("close");
  });
});
