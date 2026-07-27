export type SupportedEmailOtpType = "invite" | "recovery";

export function getSupportedEmailOtpType(value: string | null): SupportedEmailOtpType | null {
  return value === "invite" || value === "recovery" ? value : null;
}

export function getSafeConfirmationDestination(value: string | null): "/set-password" | null {
  return value === "/set-password" ? value : null;
}
