"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { isProjectLifecycleStatus, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";

const LifecycleContext = createContext<{ status: ProjectLifecycleStatus; setStatus: (status: ProjectLifecycleStatus) => void } | null>(null);

export function ProjectLifecycleProvider({ initialStatus, children }: { initialStatus: string; children: ReactNode }) {
  const [status, setStatus] = useState<ProjectLifecycleStatus>(isProjectLifecycleStatus(initialStatus) ? initialStatus : "planned");
  return <LifecycleContext.Provider value={{ status, setStatus }}>{children}</LifecycleContext.Provider>;
}

export function useProjectLifecycle() {
  const context = useContext(LifecycleContext);
  if (!context) throw new Error("Project lifecycle context is required.");
  return context;
}
