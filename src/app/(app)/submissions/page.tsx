import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SubmissionsWorkspace } from "@/components/submissions/submissions-workspace";
import { getSubmissionsData } from "@/data/queries/submissions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Submissions");
  return { title: t("title") };
}

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params] = await Promise.all([getSubmissionsData(), searchParams]);
  const requestedItemId = typeof params.item === "string" ? params.item : null;
  return <SubmissionsWorkspace {...data} requestedItemId={requestedItemId} />;
}
