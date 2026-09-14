"use client";

import { useSearchParams } from "next/navigation";

type OfficeCreateKind = "assignment" | "submission";

export function useOfficeOverlayRouting(basePath: `/office/${string}`, createKind: OfficeCreateKind) {
  const searchParams = useSearchParams();
  const createOpen = searchParams.get("create") === createKind;
  // A malformed/shared URL may contain both overlays. Creation wins so focus
  // and keyboard handling are never split across two stacked surfaces.
  const selectedItemId = createOpen ? null : searchParams.get("item");

  function updateSearchParams(update: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(window.location.search);
    update(next);
    const query = next.toString();
    // Next synchronizes native history with useSearchParams without reloading the workspace.
    window.history.replaceState(null, "", `${query ? `${basePath}?${query}` : basePath}${window.location.hash}`);
  }

  function openItem(id: string) {
    updateSearchParams((next) => {
      next.delete("create");
      next.set("item", id);
    });
  }

  function closeItem() {
    updateSearchParams((next) => next.delete("item"));
  }

  function closeCreate() {
    updateSearchParams((next) => next.delete("create"));
  }

  return { closeCreate, closeItem, createOpen, openItem, selectedItemId };
}
