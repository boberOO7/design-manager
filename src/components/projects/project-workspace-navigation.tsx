"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, type ComponentProps, type ReactNode } from "react";
import { projectWorkspaceSurfaceKey, resolveProjectWorkspace, type ProjectWorkspaceView } from "@/lib/project-workspace-navigation";

type NavigationInput = Parameters<typeof resolveProjectWorkspace>[0];
type NavigationState = ReturnType<typeof resolveProjectWorkspace> & {
  projectId: string;
  taskId?: string;
  navigate: (href: string) => boolean;
  surfaces: Readonly<Record<string, ReactNode>>;
  activeSurface: string;
  invalidateRelated: () => void;
  invalidate: () => void;
  refresh: (href?: string) => void;
};
const NavigationContext = createContext<NavigationState | null>(null);

type WorkspaceSnapshot = { key: string; search: string; revision: string; content: ReactNode; overview: ReactNode };

function snapshotSurfaces(snapshot: WorkspaceSnapshot): Record<string, ReactNode> {
  return { [snapshot.key]: snapshot.content, overview: snapshot.overview };
}

// Session-local React nodes, never a shared data/auth cache. A previously unseen
// surface still goes through the normal authorized server render.
export function ProjectWorkspaceNavigation({ projectId, snapshot, input, children }: {
  projectId: string; snapshot: WorkspaceSnapshot; input: NavigationInput; children: ReactNode;
}) {
  const search = useSearchParams();
  const router = useRouter();
  const taskId = search.get("task") ?? undefined;
  const selection = resolveProjectWorkspace({ ...input, view: search.get("view") ?? undefined, workDirection: search.get("workDirection") ?? undefined, taskId });
  const requestedKey = projectWorkspaceSurfaceKey(selection, Object.fromEntries(search));
  const canonicalSearch = new URLSearchParams(search); canonicalSearch.sort();
  const renderedSearch = canonicalSearch.toString();
  const [cache, setCache] = useState(() => ({ snapshot, pendingKey: null as string | null, surfaces: snapshotSurfaces(snapshot) }));
  if (cache.snapshot !== snapshot) {
    // Only an explicitly requested first visit may retain other surfaces. Action
    // revalidation, refresh, and changed project data replace the cache. This also
    // covers saves made on a locally selected surface rather than the last RSC URL.
    const retain = cache.pendingKey === snapshot.key && cache.snapshot.revision === snapshot.revision;
    setCache({ snapshot, pendingKey: null, surfaces: { ...(retain ? cache.surfaces : {}), ...snapshotSurfaces(snapshot) } });
  }
  const activeSurface = requestedKey === "details" && "board" in cache.surfaces ? "board" : requestedKey;
  const available = activeSurface in cache.surfaces;
  useEffect(() => {
    if (available) return;
    // Native Back/Forward can restore a surface invalidated by a save. Recover it
    // once, keeping the remaining valid surfaces instead of reloading on every click.
    setCache(current => ({ ...current, pendingKey: requestedKey }));
    router.refresh();
  }, [available, requestedKey, router]);
  const invalidateRelated = useCallback(() => {
    // Task mutations update the mounted board optimistically, without an RSC response.
    setCache(current => ({ ...current, pendingKey: null, surfaces: Object.fromEntries(Object.entries(current.surfaces).filter(([key]) => key === "board")) }));
  }, []);
  const invalidate = useCallback(() => {
    setCache(current => ({ ...current, pendingKey: null, surfaces: Object.fromEntries(Object.entries(current.surfaces).filter(([key]) => key === activeSurface)) }));
  }, [activeSurface]);
  const refreshQueued = useRef(false);
  const refresh = useCallback((href?: string) => {
    invalidate();
    if (refreshQueued.current) return;
    refreshQueued.current = true;
    queueMicrotask(() => {
      refreshQueued.current = false;
      if (window.location.pathname !== `/projects/${projectId}`) return;
      // Native history changes URL/search params without rebuilding Next's route
      // tree. A save on a local surface must reconcile that tree, not refresh the
      // previously rendered section. Aligned API writes only need one refresh.
      if (href || snapshot.search !== renderedSearch) router.replace(href ?? `${window.location.pathname}${window.location.search}`, { scroll: false });
      else router.refresh();
    });
  }, [invalidate, projectId, renderedSearch, router, snapshot.search]);
  function navigate(href: string) {
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin || target.pathname !== `/projects/${projectId}`) return false;
    // Deep finance links rely on Next's anchor scrolling after their data arrives.
    if (target.hash) return false;
    if (target.href === window.location.href) return true;
    const next = resolveProjectWorkspace({ ...input, view: target.searchParams.get("view") ?? undefined, workDirection: target.searchParams.get("workDirection") ?? undefined, taskId: target.searchParams.get("task") ?? undefined });
    const key = projectWorkspaceSurfaceKey(next, Object.fromEntries(target.searchParams));
    if (!(key in cache.surfaces) && !(key === "details" && "board" in cache.surfaces)) {
      setCache(current => ({ ...current, pendingKey: key }));
    }
    // Refresh missing data at the new URL. A normal Link can resurrect an older
    // Next router-cache payload after a mutation on a locally selected section.
    // The effect above performs exactly one request; cached visits need none.
    window.history.pushState(null, "", target.href);
    return true;
  }
  return <NavigationContext.Provider value={{ ...selection, projectId, taskId, navigate, surfaces: cache.surfaces, activeSurface, invalidateRelated, invalidate, refresh }}><div data-project-detail-shell="ready" data-workspace-direction={selection.directionId ?? "all"} className="space-y-3">{children}</div></NavigationContext.Provider>;
}

export function useProjectWorkspaceNavigation() {
  return useContext(NavigationContext);
}

// Existing mutation callbacks keep their behavior outside the project workspace.
export function useProjectWorkspaceRouter() {
  const router = useRouter();
  const navigation = useProjectWorkspaceNavigation();
  const refresh = navigation?.refresh ?? router.refresh;
  return useMemo(() => ({ ...router, refresh }), [router, refresh]);
}

export function ProjectWorkspaceLink({ onClick, workspaceView, ...props }: ComponentProps<typeof Link> & { workspaceView?: ProjectWorkspaceView }) {
  const navigation = useProjectWorkspaceNavigation();
  const path = typeof props.href === "string" ? props.href.split(/[?#]/)[0] : props.href.pathname;
  const hash = typeof props.href === "string" ? props.href.includes("#") : Boolean(props.href.hash);
  const local = navigation && path === `/projects/${navigation.projectId}` && !hash;
  return <Link {...props} aria-current={workspaceView ? navigation?.view === workspaceView ? "page" : undefined : props["aria-current"]} prefetch={false} scroll={props.scroll ?? (local ? false : undefined)} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== "_self")) return;
    if (navigation?.navigate(event.currentTarget.href)) {
      event.preventDefault();
      window.dispatchEvent(new Event("studioflow:navigation-cancel"));
    }
  }}/>;
}
