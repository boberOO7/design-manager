import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AssignmentsWorkspace } from "@/components/office/assignments-workspace";
import { getOfficeAssignmentsData } from "@/data/queries/office-assignments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OfficeAssignments");
  return { title: t("title") };
}

function kyivToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function OfficeAssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params] = await Promise.all([getOfficeAssignmentsData(), searchParams]);
  return <AssignmentsWorkspace {...data} requestedItemId={typeof params.item === "string" ? params.item : null} createRequested={params.create === "assignment"} today={kyivToday()} />;
}
