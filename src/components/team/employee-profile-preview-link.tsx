"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";

export function EmployeeProfilePreviewLink({ href, title, className, children }: {
  href: string;
  title: string;
  className: string;
  children: ReactNode;
}) {
  return <Tooltip content={title} onlyWhenTruncated="[data-preview-title]">
    <Link href={href} className={className}>{children}</Link>
  </Tooltip>;
}
