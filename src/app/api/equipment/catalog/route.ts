import { NextResponse } from "next/server";
import { searchEquipmentCatalog } from "@/data/queries/equipment-catalog";
import { equipmentCatalogSearchSchema } from "@/lib/equipment-reference-catalog";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const input = equipmentCatalogSearchSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return NextResponse.json({ error: "Invalid catalog query." }, { status: 400 });
  try {
    const suggestions = await searchEquipmentCatalog(input.data);
    if (!suggestions) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Catalog temporarily unavailable." }, { status: 503 });
  }
}
