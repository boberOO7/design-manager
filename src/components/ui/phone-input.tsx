"use client";

import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/form-field";
import { phoneInputDisplay, phoneInputEdit } from "@/lib/ukrainian-phone";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> & {
  value?: string;
  defaultValue?: string | null;
  onValueChange?: (value: string) => void;
  countryCode?: string;
  preserveInternational?: boolean;
};

/** Shared phone field for native forms and controlled editors. */
export function PhoneInput({ countryCode = "UA", defaultValue, value: controlledValue, onValueChange, preserveInternational = true, ...props }: Props) {
  const [localValue, setLocalValue] = useState(defaultValue ?? "");
  const value = phoneInputDisplay(controlledValue ?? localValue, countryCode);
  const selection = useRef<{ input: HTMLInputElement; value: string; caret: number } | null>(null);
  useLayoutEffect(() => {
    const pending = selection.current;
    if (pending?.value === value && document.activeElement === pending.input) pending.input.setSelectionRange(pending.caret, pending.caret);
    selection.current = null;
  }, [value]);

  function update(input: HTMLInputElement, raw: string, position: number) {
    const { value: formatted, caret } = phoneInputEdit(raw, position, countryCode, preserveInternational);
    input.value = formatted;
    input.setSelectionRange(caret, caret);
    selection.current = { input, value: formatted, caret };
    if (formatted !== value) {
      if (controlledValue === undefined) setLocalValue(formatted);
      onValueChange?.(formatted);
    }
  }

  return <Input {...props} placeholder={props.placeholder ?? "+380 (XX) XXX-XX-XX"} type="tel" inputMode="tel" autoComplete={props.autoComplete ?? "tel"} value={value}
    onChange={event => update(event.currentTarget, event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
    onKeyDown={event => {
      props.onKeyDown?.(event);
      const input = event.currentTarget, start = input.selectionStart ?? 0;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || start !== input.selectionEnd || (event.key !== "Backspace" && event.key !== "Delete")) return;
      const direction = event.key === "Backspace" ? -1 : 1;
      let index = direction < 0 ? start - 1 : start;
      if (index < 0 || index >= value.length || /[\d+]/.test(value[index])) return;
      // Deleting a mask separator should delete the adjacent digit, not restore the separator.
      while (index >= 0 && index < value.length && !/[\d+]/.test(value[index])) index += direction;
      if (index < 0 || index >= value.length) return;
      event.preventDefault();
      update(input, value.slice(0, index) + value.slice(index + 1), direction < 0 ? index : start);
    }}
  />;
}
