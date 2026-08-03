import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, locale = "en") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, locale = "en") {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(value?: string | null, locale = "en") {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(value?: string | null, locale = "en") {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

/** Formats a database `date` value without converting it through UTC midnight. */
export function formatDateOnly(value?: string | null, locale = "en") {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

export function getProgressPercentage(total: number, completed: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}
