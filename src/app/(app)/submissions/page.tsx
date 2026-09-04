import { redirect } from "next/navigation";

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (typeof params.item === "string") query.set("item", params.item);
  if (params.create === "submission") query.set("create", "submission");
  redirect(`/office/submissions${query.size ? `?${query.toString()}` : ""}`);
}
