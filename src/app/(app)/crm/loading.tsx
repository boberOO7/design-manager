"use client";

import { usePathname } from "next/navigation";
import { CrmBlueprint } from "@/components/crm/crm-blueprint";

export default function CrmLoading() {
  const pathname = usePathname();
  return <CrmBlueprint section={pathname.startsWith("/crm/candidates") ? "candidates" : "leads"} />;
}
