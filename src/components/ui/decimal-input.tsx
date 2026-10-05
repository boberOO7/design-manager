"use client";

import type { InputHTMLAttributes } from "react";
import { Input } from "./form-field";

export function filterDecimalInput(value: string) {
  let hasSeparator = false;
  return value.replace(/[^0-9]/g, (character) => {
    if ((character === "." || character === ",") && !hasSeparator) {
      hasSeparator = true;
      return character;
    }
    return "";
  });
}

export function DecimalInput({ onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode">) {
  return <Input {...props} type="text" inputMode="decimal" onChange={(event) => {
    const input = event.currentTarget;
    const filtered = filterDecimalInput(input.value);
    if (filtered !== input.value) {
      const caret = filterDecimalInput(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
      input.value = filtered;
      input.setSelectionRange(caret, caret);
    }
    onChange?.(event);
  }}/>;
}
