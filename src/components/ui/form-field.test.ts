import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";
import { datePickerClassName } from "./date-picker";
import { inputClassName, textareaClassName } from "./form-field";
import { timePickerClassName } from "./time-picker";

describe("shared form-control focus contract", () => {
  it("uses the shared border-based treatment for fields and keeps action-button focus", () => {
    for (const className of [inputClassName, textareaClassName, datePickerClassName, timePickerClassName]) {
      expect(className).toContain("ui-form-control");
      expect(className).not.toContain("ring-");
    }
    expect(buttonVariants()).toContain("focus-visible:ring-2");
  });

  it("uses the strong semantic border for equivalent default form shells", () => {
    for (const className of [inputClassName, textareaClassName, datePickerClassName, timePickerClassName]) {
      expect(className).toContain("border-[var(--ui-border-strong)]");
      expect(className).not.toContain("border-[var(--ui-border)]");
    }
  });
});
