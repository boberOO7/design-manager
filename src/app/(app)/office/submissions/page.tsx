import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SubmissionsWorkspace } from "@/components/submissions/submissions-workspace";
import { getSubmissionsData } from "@/data/queries/submissions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Submissions");
  return { title: t("title") };
}

export default async function OfficeSubmissionsPage() {
  const data = await getSubmissionsData();
  return <SubmissionsWorkspace {...data} />;
}
