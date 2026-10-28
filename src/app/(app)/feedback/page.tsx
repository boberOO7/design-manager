import { redirect } from "next/navigation";

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ section: "feedback" });
  for (const key of ["from", "to", "project", "period"]) {
    const value = params[key];
    if (typeof value === "string") query.set(key, value);
  }
  redirect(`/statistics?${query}`);
}
