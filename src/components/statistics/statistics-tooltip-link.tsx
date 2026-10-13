"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";

/** Create the slot target locally; streamed server children can be lazy arrays. */
export function StatisticsTooltipLink({ href, content, className, children }: {
  href: string; content: string; className: string; children: ReactNode;
}) {
  return <Tooltip content={content}><Link href={href} className={className}>{children}</Link></Tooltip>;
}
