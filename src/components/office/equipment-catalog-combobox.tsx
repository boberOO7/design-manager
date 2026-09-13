"use client";

import { useCallback, type ComponentProps } from "react";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { COMMON_EQUIPMENT_MANUFACTURERS, equipmentCatalogResultsSchema, equipmentManufacturerSuggestions, type EquipmentCatalogSearch } from "@/lib/equipment-reference-catalog";

export function EquipmentCatalogCombobox({ type, field = "model", manufacturer = "", family = "", ...props }:
  Omit<ComponentProps<typeof CreatableCombobox>, "options" | "loadOptions"> &
  Pick<EquipmentCatalogSearch, "type"> & Partial<Pick<EquipmentCatalogSearch, "field" | "manufacturer" | "family">>) {
  const loadOptions = useCallback(async (query: string, signal: AbortSignal) => {
    if (field === "model" && query.length < 2) return [];
    const params = new URLSearchParams({ type, field, manufacturer, family, query });
    const response = await fetch(`/api/equipment/catalog?${params}`, { signal, cache: "no-store" });
    if (!response.ok) return field === "manufacturer" ? equipmentManufacturerSuggestions(type, query, []) : [];
    const catalog = equipmentCatalogResultsSchema.parse(await response.json()).suggestions;
    return field === "manufacturer" ? equipmentManufacturerSuggestions(type, query, catalog) : catalog;
  }, [type, field, manufacturer, family]);
  return <CreatableCombobox {...props} options={field === "manufacturer" ? COMMON_EQUIPMENT_MANUFACTURERS[type] : []} loadOptions={loadOptions} />;
}
