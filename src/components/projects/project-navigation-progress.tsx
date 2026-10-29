"use client";

import { createContext, useContext, useEffect, useId } from "react";
import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";

export const ProjectNavigationPendingContext = createContext<((id: string, pending: boolean) => void) | null>(null);

export function ProjectNavigationProgress() {
  const { pending } = useLinkStatus(), id = useId();
  const register = useContext(ProjectNavigationPendingContext);
  useEffect(() => {
    register?.(id, pending);
    return () => register?.(id, false);
  }, [pending, id, register]);
  return pending ? <LoaderCircle aria-hidden="true" className="pointer-events-none absolute right-1 top-1 size-2.5 animate-spin motion-reduce:animate-none"/> : null;
}
