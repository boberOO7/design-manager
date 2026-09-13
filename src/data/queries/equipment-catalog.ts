import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { equipmentCatalogSearchSchema, type EquipmentCatalogSearch } from "@/lib/equipment-reference-catalog";

export async function searchEquipmentCatalog(input: EquipmentCatalogSearch) {
  const search = equipmentCatalogSearchSchema.parse(input);
  const actor = await resolveActiveStudioMembership();
  if (actor.status !== "ACTIVE_STUDIO" || actor.membership.system_role !== "admin") return null;
  if (search.field === "model" && search.query.length < 2) return [];
  const client = await createClient();
  const { data, error } = await client.rpc("search_equipment_catalog", {
    p_type: search.type, p_field: search.field, p_query: search.query, p_manufacturer: search.manufacturer, p_family: search.family,
  });
  if (error) throw new Error("Equipment catalog search failed", { cause: error });
  return (data ?? []).map(row => row.value);
}
