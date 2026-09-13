import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EquipmentWorkspace } from "@/components/office/equipment-workspace";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getEquipmentData } from "@/data/queries/equipment";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Equipment");
  return { title: t("title") };
}

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getActiveStudioAdmin();
  if (!admin) redirect("/office");
  const params = await searchParams;
  const data = await getEquipmentData(admin);
  return <EquipmentWorkspace {...data} initialView={params.view === "workstations" || params.view === "maintenance" ? params.view : "inventory"} initialWorkstationView={params.layout === "floor-plan" ? "floorPlan" : "cards"} />;
}
