"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

// Render the actual download bytes: the preview has no separate document layout.
export default function ProposalPreview({ url }: { url: string }) {
  const t = useTranslations("Finance.proposal");
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let cancelled = false;
    const pages: {canvas: HTMLCanvasElement; width: number; height: number}[] = [];
    const fitPages = () => {
      // Account for the pane padding and the canvas border on both axes.
      const width=Math.max(0,container.clientWidth-18), height=Math.max(0,container.clientHeight-18);
      for(const page of pages) {
        const scale=Math.min(width/page.width,height/page.height);
        page.canvas.style.width=`${page.width*scale}px`; page.canvas.style.height=`${page.height*scale}px`;
      }
    };
    const resize=new ResizeObserver(fitPages); resize.observe(container);
    let destroy: (() => Promise<void>) | undefined;
    setError(false); container.replaceChildren();
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (cancelled) return;
      // This worker is vendored from the pinned pdfjs-dist version; update together.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({ url });
      destroy = () => task.destroy();
      const document = await task.promise;
      container.className = document.numPages === 1
        ? "flex h-full w-full items-center justify-center overflow-hidden p-2"
        : "flex h-full w-full flex-col items-center gap-2 overflow-y-auto overflow-x-hidden p-2";
      for (let number = 1; number <= document.numPages; number++) {
        if (cancelled) return;
        const page = await document.getPage(number);
        const canvas = window.document.createElement("canvas");
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width; canvas.height = viewport.height; canvas.style.boxSizing="content-box";
        canvas.className = "block shrink-0 border border-[var(--ui-border)] bg-white shadow-sm";
        canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", t("page", { number }));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PDF canvas unavailable");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (!cancelled) {
          pages.push({canvas,width:viewport.width,height:viewport.height});
          container.appendChild(canvas); fitPages();
          const text = await page.getTextContent();
          const transcript = window.document.createElement("p");
          transcript.className = "sr-only";
          transcript.textContent = text.items.map((item) => "str" in item ? item.str : "").join("\n");
          if (!cancelled) container.appendChild(transcript);
        }
      }
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; resize.disconnect(); void destroy?.(); };
  }, [url, t]);
  return <div aria-label={t("preview")} role="region" className="relative h-full min-h-0 w-full">{error ? <p role="alert" className="p-4 text-sm text-[var(--ui-danger-text)]">{t("error")}</p> : null}<div ref={host} data-proposal-pages/></div>;
}
