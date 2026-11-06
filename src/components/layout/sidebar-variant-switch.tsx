"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type SidebarVariant = "classic" | "new";
const STORAGE_KEY = "studioflow-sidebar-variant";

const CHANGE_EVENT = "studioflow-sidebar-variant-change";
let volatileVariant: SidebarVariant | undefined;

function getSnapshot(): SidebarVariant {
  if (volatileVariant) return volatileVariant;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "classic" ? "classic" : "new";
  } catch {
    return "new";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Temporary comparison control: remove this module once the layout is chosen.
export function useSidebarVariant() {
  const variant = useSyncExternalStore<SidebarVariant>(subscribe, getSnapshot, () => "new");

  function selectVariant(next: SidebarVariant) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      volatileVariant = undefined;
    } catch {
      // The comparison still works for the current page without storage.
      volatileVariant = next;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return { variant, selectVariant };
}

export function SidebarVariantSwitch({ variant, onChange }: { variant: SidebarVariant; onChange: (variant: SidebarVariant) => void }) {
  const t = useTranslations("Navigation");

  return (
    <div role="group" aria-label={t("sidebarVariant")} className="mx-5 mt-3 flex rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-0.5">
      {(["classic", "new"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={variant === value}
          onPointerUp={(event) => event.currentTarget.blur()}
          onClick={() => onChange(value)}
          className={cn("min-h-8 flex-1 whitespace-nowrap rounded-[var(--ui-radius-control)] px-3 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", variant === value ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-strong)]")}
        >
          {t(value === "classic" ? "sidebarClassic" : "sidebarNew")}
        </button>
      ))}
    </div>
  );
}
