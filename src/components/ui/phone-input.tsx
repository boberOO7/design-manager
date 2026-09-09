"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/form-field";
import { formatUkrainianPhone, shouldFormatAsUkrainianPhone } from "@/lib/ukrainian-phone";

type PhoneInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "type" | "value" | "onChange"> & {
  countryCode?: string;
  defaultValue?: string | null;
  preserveInternational?: boolean;
};

/** Shared StudioFlow phone input. Ukrainian values use the Contractor mask; foreign values remain editable. */
export function PhoneInput({ countryCode = "UA", defaultValue, preserveInternational = false, ...props }: PhoneInputProps) {
  const initialValue = String(defaultValue ?? "");
  const [value, setValue] = useState(() => shouldFormatAsUkrainianPhone(initialValue, countryCode, preserveInternational)
    ? formatUkrainianPhone(initialValue)
    : initialValue);

  return <Input
    {...props}
    autoComplete={props.autoComplete ?? "tel"}
    defaultValue={undefined}
    inputMode="tel"
    onChange={(event) => {
      const nextValue = event.target.value;
      setValue(shouldFormatAsUkrainianPhone(nextValue, countryCode, preserveInternational) ? formatUkrainianPhone(nextValue) : nextValue);
    }}
    type="tel"
    value={value}
  />;
}
