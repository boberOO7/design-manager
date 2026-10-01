import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhoneInput } from "./phone-input";
import { formatPhoneInput, phoneInputDisplay, phoneInputEdit } from "@/lib/ukrainian-phone";

describe("shared phone input", () => {
  const complete = "+380 (67) 123-45-67";

  it("progressively formats national and country-prefixed typing", () => {
    for (const typed of ["0671234567", "380671234567", "+380671234567"]) {
      let value = "";
      for (const character of typed) value = formatPhoneInput(value + character);
      expect(value).toBe(complete);
    }
    expect(formatPhoneInput("06")).toBe("+380 (6");
    expect(formatPhoneInput("067123")).toBe("+380 (67) 123");
  });

  it("normalizes common pastes and filters non-phone content", () => {
    for (const pasted of ["380671234567", "+380671234567", "0671234567", "+38 (067) 123-45-67", "00380671234567"]) expect(formatPhoneInput(pasted)).toBe(complete);
    expect(formatPhoneInput("call: 067 123 45 67!")).toBe(complete);
    expect(formatPhoneInput("letters Ж @#$")).toBe("");
  });

  it("retains the caret for middle edits and digit deletion", () => {
    expect(phoneInputEdit("+380 (67) 193-45-67", 12)).toEqual({ value: "+380 (67) 193-45-67", caret: 12 });
    expect(phoneInputEdit("+380 (67) 19-45-67", 12)).toEqual({ value: "+380 (67) 194-56-7", caret: 12 });
    expect(phoneInputEdit("+380 (67) 123-45-6", 18)).toEqual({ value: "+380 (67) 123-45-6", caret: 18 });
    expect(phoneInputEdit("", 0)).toEqual({ value: "", caret: 0 });
  });

  it("preserves international numbers and existing unrecognized values", () => {
    let value = "";
    for (const character of "+442012345678") value = formatPhoneInput(value + character);
    expect(value).toBe("+442012345678");
    expect(formatPhoneInput("+44 (20) 1234-5678")).toBe("+44 (20) 1234-5678");
    expect(formatPhoneInput("0044 20 1234 5678")).toBe("0044 20 1234 5678");
    expect(formatPhoneInput("+38067123456789")).toBe("+38067123456789");
    expect(phoneInputDisplay("legacy contact text")).toBe("legacy contact text");
    expect(phoneInputDisplay("+38 (067) 123-45-67")).toBe(complete);
    expect(phoneInputDisplay("+44 20 1234 5678")).toBe("+44 20 1234 5678");
    expect(formatPhoneInput("123456789", "PL")).toBe("123456789");
  });

  it("shares the native input styling and placeholder in both controlled and form modes", () => {
    const controlled = renderToStaticMarkup(<PhoneInput value="0671234567" onValueChange={() => {}} />);
    const form = renderToStaticMarkup(<PhoneInput name="phone" defaultValue="0671234567" disabled aria-invalid aria-describedby="phone-error" />);
    for (const markup of [controlled, form]) {
      expect(markup).toContain('placeholder="+380 (XX) XXX-XX-XX"');
      expect(markup).toContain('value="+380 (67) 123-45-67"');
      expect(markup).toContain('type="tel"');
      expect(markup).toContain('inputMode="tel"');
      expect(markup).toContain("focus-visible:ring");
      expect(markup).toContain("disabled:cursor-not-allowed");
    }
    expect(form).toContain('name="phone"');
    expect(form).toContain('disabled=""');
    expect(form).toContain('aria-invalid="true"');
    expect(form).toContain('aria-describedby="phone-error"');
  });
});
