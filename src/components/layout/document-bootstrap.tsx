"use client";

import { useServerInsertedHTML } from "next/navigation";
import { useRef } from "react";
import { motionBootstrapScript } from "@/lib/motion";
import { themeBootstrapScript } from "@/lib/theme";

export function DocumentBootstrap() {
  const inserted = useRef(false);

  // Emit parser-executed head scripts only in the document stream. Client
  // navigation and hydration recovery must never mount executable script tags.
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <>
      <script id="motion-bootstrap" dangerouslySetInnerHTML={{ __html: motionBootstrapScript }} />
      <script id="theme-bootstrap" dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
    </>;
  });

  return null;
}
