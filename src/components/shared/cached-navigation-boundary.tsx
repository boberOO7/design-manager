"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

// Render IDs only: payloads remain in Next's default history cache.
const seenServerRenders = new Set<string>();

export function CachedNavigationBoundary({ children, fallback, path, snapshot, verifyScope, failure, retryLabel }: {
  children: ReactNode; fallback: ReactNode; path: string;
  snapshot: { scope: string | null; prefetched: boolean; renderId: string };
  verifyScope: () => Promise<{ scope: string | null }>;
  failure: string; retryLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [verifiedScope, setVerifiedScope] = useState(!snapshot.prefetched && !seenServerRenders.has(snapshot.renderId) ? snapshot.scope : null);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const active = useRef(false);
  const latest = useRef({ snapshot, verifyScope });
  useLayoutEffect(() => {
    latest.current = { snapshot, verifyScope };
    if (active.current && !seenServerRenders.has(snapshot.renderId)) {
      ++generation.current;
      seenServerRenders.add(snapshot.renderId);
      setVerifiedScope(snapshot.scope);
    }
  }, [snapshot, verifyScope]);

  function check() {
    const request = ++generation.current;
    setVerifiedScope(null);
    setFailed(false);
    void latest.current.verifyScope().then(result => {
      if (!active.current || request !== generation.current) return;
      setVerifiedScope(result.scope);
      router.refresh();
    }).catch(() => {
      if (!active.current || request !== generation.current) return;
      setFailed(true);
    });
  }

  useLayoutEffect(() => {
    if (pathname !== path) return;
    active.current = true;
    const current = latest.current.snapshot;
    const returning = seenServerRenders.has(current.renderId);
    seenServerRenders.add(current.renderId);
    if (current.prefetched || returning || !current.scope) check();
    else setVerifiedScope(current.scope);
    return () => { active.current = false; ++generation.current; };
    // Check restored history once per activation. Fresh server visits need no extra requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, path, router]);

  const ready = verifiedScope !== null && verifiedScope === snapshot.scope;
  return <div data-projects-navigation={ready ? "verified" : failed ? "failed" : "checking"}>
    {ready ? children : <>{fallback}{failed ? <div role="alert" className="space-y-3 text-sm"><p>{failure}</p><button type="button" onClick={check} className="ui-button-secondary">{retryLabel}</button></div> : null}</>}
  </div>;
}
