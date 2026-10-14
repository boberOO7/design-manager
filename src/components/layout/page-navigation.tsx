"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { gsap } from "gsap";
import { watchInstaLoadMotion } from "@/components/shared/instaload-reveal";

const motionOwners = "[data-instaload-ready], [data-dashboard-ready], [data-statistics-motion], .instaload-blueprint, .dashboard-blueprint";

/** Keep the shell and current page in place while Next owns the navigation. */
export function PageNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const route = `${pathname}?${search}`;
  const t = useTranslations("Common");
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  const previousRoute = useRef(route);
  const finishReveal = useRef(() => {});
  const [pending, setPending] = useState(false);

  useLayoutEffect(() => {
    const start = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      // Hash links and reselecting the current page keep normal browser behavior.
      const changingPage = destination.pathname !== window.location.pathname || destination.search !== window.location.search;
      finishReveal.current();
      setPending(changingPage);
    };
    const history = () => {
      finishReveal.current();
      const current = `${window.location.pathname}?${new URLSearchParams(window.location.search)}`;
      setPending(current !== previousRoute.current);
    };
    const clear = () => setPending(false);
    document.addEventListener("click", start, true);
    window.addEventListener("popstate", history);
    window.addEventListener("pageshow", clear);
    window.addEventListener("studioflow:navigation-cancel", clear);
    return () => {
      document.removeEventListener("click", start, true);
      window.removeEventListener("popstate", history);
      window.removeEventListener("pageshow", clear);
      window.removeEventListener("studioflow:navigation-cancel", clear);
    };
  }, []);

  useLayoutEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    setPending(false);
  }, [route]);

  useLayoutEffect(() => {
    const root = main.current;
    if (!root || previousPath.current === pathname) return;
    previousPath.current = pathname;
    // Streamed pages continue their own CSS/GSAP clock, including their fallback.
    if (root.querySelector(motionOwners)) return;
    let context: gsap.Context | undefined;
    const finish = () => {
      context?.revert();
      context = undefined;
      root.dataset.pageNavigation = "ready";
    };
    finishReveal.current = finish;
    const motion = watchInstaLoadMotion(root, finish);
    if (!motion.disabled() && !root.contains(document.activeElement)) {
      const content = Array.from(root.children).filter((element): element is HTMLElement => element instanceof HTMLElement && !element.hidden);
      root.dataset.pageNavigation = "revealing";
      context = gsap.context(() => {
        gsap.fromTo(content, { y: 4 }, {
          y: 0, duration: 0.18, ease: "power3.out", clearProps: "transform",
          onComplete: () => { root.dataset.pageNavigation = "ready"; },
        });
      }, root);
    }
    return () => {
      motion.dispose();
      finish();
      finishReveal.current = () => {};
    };
  }, [pathname]);

  return <>
    <div data-navigation-feedback={pending ? "pending" : "idle"} className="page-navigation-feedback" aria-hidden="true"><span /></div>
    <span role="status" className="sr-only">{pending ? t("loading") : ""}</span>
    <main ref={main} id="main-content" tabIndex={-1} data-page-navigation="ready" aria-busy={pending} className="relative flex flex-1 flex-col p-5 outline-none lg:min-h-0 lg:overflow-y-auto lg:p-8">{children}</main>
  </>;
}
