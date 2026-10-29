"use client";

import { ProjectWorkspaceLink, useProjectWorkspaceNavigation } from "./project-workspace-navigation";
import { useTranslations } from "next-intl";
import styles from "./work-directions.module.css";
import { projectWorkspaceHref, type ProjectWorkspaceView } from "@/lib/project-workspace-navigation";
import { ProjectNavigationProgress } from "./project-navigation-progress";
import { useLayoutEffect, useRef } from "react";

function ProjectWorkspaceTab({ projectId, view, backHref, label }: { projectId: string; view: ProjectWorkspaceView; backHref: string; label: string }) {
  const navigation = useProjectWorkspaceNavigation();
  const active = navigation?.view === view;
  return <ProjectWorkspaceLink href={projectWorkspaceHref(projectId, view, navigation?.directionId ?? null, backHref)} aria-current={active ? "page" : undefined} className={styles.workspaceTab}>{label}<ProjectNavigationProgress/></ProjectWorkspaceLink>;
}

export function ProjectWorkspaceTabs({ projectId, backHref = "", canViewFinance, selected }: { projectId: string; backHref?: string; canViewFinance: boolean; selected: string | null }) {
  const t = useTranslations("ProjectWorkspace");
  const navigation = useProjectWorkspaceNavigation();
  const tabs = useRef<HTMLElement>(null), indicator = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = tabs.current;
    if (!root) return;
    const keyboard = () => { root.dataset.instant = "true"; };
    const pointer = () => { delete root.dataset.instant; };
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => { document.removeEventListener("keydown", keyboard, true); document.removeEventListener("pointerdown", pointer, true); };
  }, []);
  useLayoutEffect(() => {
    const root = tabs.current, line = indicator.current;
    if (!root || !line) return;
    let frame = 0;
    const measure = () => {
      const active = root.querySelector<HTMLElement>('[aria-current="page"]');
      line.dataset.visible = String(Boolean(active));
      if (!active) return;
      const box = active.getBoundingClientRect(), parent = root.getBoundingClientRect();
      line.style.transform = `translateX(${box.left - parent.left}px) scaleX(${box.width})`;
      // Hydration starts at the selected tab, never sweeping in from the origin.
      if (!line.dataset.ready) frame = requestAnimationFrame(() => { line.dataset.ready = "true"; });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll("a").forEach(link => observer.observe(link));
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [navigation?.view, selected, canViewFinance, t]);
  const views: Array<{ id: ProjectWorkspaceView; label: string }> = selected
    ? [{ id: "board", label: t("board") }, { id: "details", label: t("details") }]
    : [{ id: "overview", label: t("directions.projectOverview") }];
  if (canViewFinance) views.push({ id: "finance", label: t("finance") });
  return <nav ref={tabs} aria-label={t("navigation")} className={styles.workspaceTabs}>
    {views.map(item => <ProjectWorkspaceTab key={item.id} projectId={projectId} view={item.id} backHref={backHref} label={item.label}/>)}
    <span ref={indicator} aria-hidden="true" className={styles.workspaceIndicator} data-workspace-indicator/>
  </nav>;
}
