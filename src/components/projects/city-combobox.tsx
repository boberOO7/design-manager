"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, LoaderCircle, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import type { CitySearchResult } from "@/lib/city-provider";
import { shouldOpenCitySuggestions, shouldSearchCity } from "@/lib/city-combobox";

type SearchState = "idle" | "loading" | "ready" | "error";

export function CityCombobox({ countryCode, describedBy, invalid, name, onValueChange, value }: {
  countryCode: string;
  describedBy?: string;
  invalid?: boolean;
  name: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const t = useTranslations("CitySearch");
  const locale = useLocale();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const skipSearchValueRef = useRef<string | null>(null);
  const userEditedRef = useRef(false);
  const [inputNode, setInputNode] = useState<HTMLInputElement | null>(null);
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [status, setStatus] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const portalContainer = inputNode?.closest("dialog, [role='dialog']") ?? undefined;

  useEffect(() => {
    const query = value.trim();
    if (skipSearchValueRef.current === query) {
      skipSearchValueRef.current = null;
      return;
    }
    if (!shouldSearchCity({ countryCode, query, userEdited: userEditedRef.current })) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      setOpen(true);
      try {
        const response = await fetch(`/api/cities?${new URLSearchParams({ country: countryCode, locale, q: query })}`, { signal: controller.signal });
        if (!response.ok) throw new Error("City search failed");
        const payload: unknown = await response.json();
        if (typeof payload !== "object" || payload === null || !("results" in payload) || !Array.isArray(payload.results)) throw new Error("Invalid city search response");
        const nextResults = payload.results.filter(isCityResult).slice(0, 10);
        setResults(nextResults);
        setActiveIndex(nextResults.length ? 0 : -1);
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setActiveIndex(-1);
        setStatus("error");
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [countryCode, locale, value]);

  function choose(result: CitySearchResult) {
    skipSearchValueRef.current = result.name;
    userEditedRef.current = false;
    onValueChange(result.name);
    setOpen(false);
    setResults([]);
    inputRef.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1 + results.length) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const statusMessage = status === "loading"
    ? t("loading")
    : status === "error"
      ? t("failure")
      : status === "ready" && results.length === 0
        ? t("empty")
        : null;

  return <PopoverPrimitive.Root modal={false} open={Boolean(countryCode && value.trim()) && open} onOpenChange={setOpen}>
    <PopoverPrimitive.Anchor asChild>
      <div className="relative mt-2">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" />
        <input
          ref={(node) => { inputRef.current = node; setInputNode(node); }}
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${results[activeIndex]?.id}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          className="h-11 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] pl-9 pr-10 text-sm text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-muted)] focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-[var(--ui-focus-soft)] aria-invalid:border-[var(--ui-danger-border)]"
          name={name}
          onChange={(event) => {
            const nextValue = event.target.value;
            userEditedRef.current = true;
            if (!nextValue.trim()) {
              setResults([]);
              setStatus("idle");
              setOpen(false);
            }
            onValueChange(nextValue);
          }}
          onFocus={() => {
            if (shouldOpenCitySuggestions({ query: value, status, userEdited: userEditedRef.current })) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          role="combobox"
          value={value}
        />
        {status === "loading" ? <LoaderCircle aria-hidden="true" className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-[var(--ui-text-muted)] motion-reduce:animate-none" /> : null}
      </div>
    </PopoverPrimitive.Anchor>
    <PopoverPrimitive.Portal container={portalContainer}>
      <PopoverPrimitive.Content align="start" sideOffset={4} collisionPadding={8} className="z-[80] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-popover)]" onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}>
        <div id={listboxId} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {results.map((result, index) => <div
            id={`${listboxId}-${result.id}`}
            key={result.id}
            role="option"
            aria-selected={activeIndex === index}
            className="grid min-h-11 cursor-default grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-2 py-2 text-sm text-[var(--ui-text-secondary)] data-[active=true]:bg-[var(--ui-surface-muted)] data-[active=true]:text-[var(--ui-text)]"
            data-active={activeIndex === index}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(result)}
          >
            <span className="flex size-4 items-center justify-center">{value === result.name ? <Check aria-hidden="true" className="size-3.5" /> : null}</span>
            <span className="min-w-0"><span className="block font-medium">{result.name}</span><span className="block truncate text-xs text-[var(--ui-text-muted)]">{[result.region, result.countryName].filter(Boolean).join(", ")}</span></span>
          </div>)}
          {statusMessage ? <p role="status" className="px-3 py-4 text-sm text-[var(--ui-text-muted)]">{statusMessage}</p> : null}
          {status === "ready" ? <p className="border-t border-[var(--ui-border-subtle)] px-3 py-2 text-xs text-[var(--ui-text-muted)]">{t("manual")}</p> : null}
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}

function isCityResult(value: unknown): value is CitySearchResult {
  if (typeof value !== "object" || value === null) return false;
  return "id" in value && typeof value.id === "number"
    && "name" in value && typeof value.name === "string"
    && "displayName" in value && typeof value.displayName === "string"
    && "region" in value && (value.region === null || typeof value.region === "string")
    && "countryName" in value && (value.countryName === null || typeof value.countryName === "string");
}
