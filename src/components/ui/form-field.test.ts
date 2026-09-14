import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button";
import { datePickerClassName } from "./date-picker";
import { inputClassName, textareaClassName } from "./form-field";
import { timePickerClassName } from "./time-picker";

describe("shared form-control focus contract", () => {
  it("uses the same keyboard-only focus treatment for inputs, textareas, selects, and buttons", () => {
    for (const className of [inputClassName, textareaClassName, buttonVariants()]) {
      expect(className).toContain("focus-visible:outline-none");
      expect(className).toContain("focus-visible:ring-2");
      expect(className).toContain("focus-visible:ring-[var(--ui-focus)]");
      expect(className).not.toContain("focus:ring-");
    }
  });

  it("uses the strong semantic border for equivalent default form shells", () => {
    for (const className of [inputClassName, textareaClassName, datePickerClassName, timePickerClassName]) {
      expect(className).toContain("border-[var(--ui-border-strong)]");
      expect(className).not.toContain("border-[var(--ui-border)]");
    }
  });
});
