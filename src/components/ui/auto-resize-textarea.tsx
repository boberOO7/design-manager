"use client";

import { forwardRef, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { Textarea } from "./form-field";
import { cn } from "@/lib/utils";

export const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function AutoResizeTextarea({ className, onInput, value, defaultValue, rows = 1, ...props }, ref) {
    const element = useRef<HTMLTextAreaElement | null>(null);
    const resize = () => {
      const node = element.current;
      if (!node) return;
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
    };
    useLayoutEffect(resize, [value, defaultValue]);
    useLayoutEffect(() => {
      const node = element.current;
      if (!node) return;
      let width = node.clientWidth;
      const observer = new ResizeObserver(() => {
        if (node.clientWidth !== width) { width = node.clientWidth; resize(); }
      });
      observer.observe(node);
      return () => observer.disconnect();
    }, []);
    return <Textarea {...props} value={value} defaultValue={defaultValue} rows={rows}
      ref={node => { element.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }}
      className={cn("min-h-11 max-h-48 resize-none overflow-y-auto", className)}
      onInput={event => { onInput?.(event); resize(); }} />;
  },
);
