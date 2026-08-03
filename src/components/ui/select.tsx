"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type SelectItemProps = React.HTMLAttributes<HTMLDivElement> & {
  disabled?: boolean;
  textValue?: string;
  value: string;
};

type SelectItemElement = React.ReactElement<SelectItemProps>;

function isSelectItemElement(node: React.ReactNode): node is SelectItemElement {
  return React.isValidElement<SelectItemProps>(node) && node.type === SelectItem;
}

function collectSelectItems(children: React.ReactNode): SelectItemElement[] {
  const items: SelectItemElement[] = [];
  React.Children.forEach(children, (child) => {
    if (isSelectItemElement(child)) {
      items.push(child);
      return;
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment) {
      items.push(...collectSelectItems(child.props.children));
    }
  });
  return items;
}

function getNodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return getNodeText(node.props.children);
  return "";
}

export function getNextSelectValue(items: ReadonlyArray<{ disabled?: boolean; value: string }>, currentValue: string | undefined, direction: "first" | "last" | "next" | "previous") {
  const enabledItems = items.filter((item) => !item.disabled);
  if (!enabledItems.length) return undefined;
  if (direction === "first") return enabledItems[0].value;
  if (direction === "last") return enabledItems[enabledItems.length - 1].value;
  const currentIndex = enabledItems.findIndex((item) => item.value === currentValue);
  if (currentIndex < 0) return direction === "next" ? enabledItems[0].value : enabledItems[enabledItems.length - 1].value;
  const offset = direction === "next" ? 1 : -1;
  return enabledItems[(currentIndex + offset + enabledItems.length) % enabledItems.length].value;
}

type SelectContextValue = {
  getItemId: (value: string) => string;
  highlightedValue: string | undefined;
  onHighlight: (value: string) => void;
  onSelect: (value: string) => void;
  selectedValue: string | undefined;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

export type SelectProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "defaultValue" | "onChange" | "value"
> & {
  children: React.ReactNode;
  defaultValue?: string;
  name?: string;
  onValueChange?: (value: string) => void;
  placeholder?: React.ReactNode;
  required?: boolean;
  size?: "compact" | "default";
  value?: string;
  width?: "content" | "full";
};

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select({ "aria-invalid": ariaInvalid, children, className, defaultValue, disabled, name, onClick, onKeyDown, onValueChange, placeholder, required, size = "default", value, width = "full", ...triggerProps }, forwardedRef) {
  const items = collectSelectItems(children);
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [highlightedValue, setHighlightedValue] = React.useState<string>();
  const [requiredInvalid, setRequiredInvalid] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [triggerNode, setTriggerNode] = React.useState<HTMLButtonElement | null>(null);
  const listboxId = React.useId();
  const typeaheadRef = React.useRef("");
  const typeaheadTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedValue = value !== undefined ? value : internalValue;
  const selectedItem = items.find((item) => item.props.value === selectedValue);
  const selectedLabel = selectedItem?.props.children;
  const selectedText = selectedItem?.props.textValue ?? getNodeText(selectedLabel);
  const portalContainer = triggerNode?.closest("dialog, [role='dialog']") ?? undefined;
  const itemModels = items.map((item) => ({ disabled: item.props.disabled, value: item.props.value }));

  const setTriggerRef = React.useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    setTriggerNode(node);
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  const choose = React.useCallback((nextValue: string) => {
    const item = items.find((candidate) => candidate.props.value === nextValue);
    if (!item || item.props.disabled) return;
    if (value === undefined) setInternalValue(nextValue);
    setRequiredInvalid(false);
    onValueChange?.(nextValue);
    setOpen(false);
  }, [items, onValueChange, value]);

  React.useEffect(() => {
    const form = triggerRef.current?.closest("form");
    if (!form || value !== undefined) return;
    const reset = () => {
      setInternalValue(defaultValue);
      setRequiredInvalid(false);
      setOpen(false);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue, value]);

  React.useEffect(() => () => {
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
  }, []);

  function highlight(direction: "first" | "last" | "next" | "previous") {
    const nextValue = getNextSelectValue(itemModels, highlightedValue ?? selectedValue, direction);
    if (nextValue !== undefined) setHighlightedValue(nextValue);
  }

  function openWith(direction: "first" | "last") {
    const selectedIsEnabled = items.some((item) => item.props.value === selectedValue && !item.props.disabled);
    setHighlightedValue(selectedIsEnabled ? selectedValue : getNextSelectValue(itemModels, undefined, direction));
    setOpen(true);
  }

  function typeahead(key: string) {
    const search = `${typeaheadRef.current}${key}`.toLocaleLowerCase();
    typeaheadRef.current = search;
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(() => { typeaheadRef.current = ""; }, 700);
    const match = items.find((item) => !item.props.disabled && (item.props.textValue ?? getNodeText(item.props.children)).toLocaleLowerCase().startsWith(search));
    if (match) {
      setHighlightedValue(match.props.value);
      if (!open) setOpen(true);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openWith(event.key === "ArrowDown" ? "first" : "last");
      else highlight(event.key === "ArrowDown" ? "next" : "previous");
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) openWith(event.key === "Home" ? "first" : "last");
      else highlight(event.key === "Home" ? "first" : "last");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openWith("first");
      else if (highlightedValue !== undefined) choose(highlightedValue);
      return;
    }
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) typeahead(event.key);
  }

  const contextValue = React.useMemo<SelectContextValue>(() => ({
    getItemId: (itemValue) => `${listboxId}-option-${items.findIndex((item) => item.props.value === itemValue)}`,
    highlightedValue,
    onHighlight: setHighlightedValue,
    onSelect: choose,
    selectedValue,
  }), [choose, highlightedValue, items, listboxId, selectedValue]);

  return <SelectContext.Provider value={contextValue}>
    <PopoverPrimitive.Root modal={false} open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) {
        const selectedIsEnabled = items.some((item) => item.props.value === selectedValue && !item.props.disabled);
        setHighlightedValue(selectedIsEnabled ? selectedValue : getNextSelectValue(itemModels, undefined, "first"));
      }
    }}>
      <PopoverPrimitive.Anchor asChild>
        <button
          ref={setTriggerRef}
          type="button"
          {...triggerProps}
          role="combobox"
          aria-activedescendant={open && highlightedValue !== undefined ? contextValue.getItemId(highlightedValue) : undefined}
          aria-autocomplete="none"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={ariaInvalid || requiredInvalid || undefined}
          aria-required={required || undefined}
          className={cn(
            "group grid min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-center overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] text-left text-sm text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:border-[var(--ui-focus)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[var(--ui-surface-muted)] disabled:opacity-60 aria-invalid:border-[var(--ui-danger-border)] aria-invalid:focus-visible:ring-[var(--ui-danger-text)] data-[placeholder]:text-[var(--ui-text-muted)] data-[state=open]:border-[var(--ui-focus)] data-[state=open]:bg-[var(--ui-surface-subtle)] data-[state=open]:ring-2 data-[state=open]:ring-[var(--ui-focus)] data-[state=open]:ring-offset-2",
            size === "compact" ? "h-8 text-xs" : "h-11",
            width === "content" ? "w-fit min-w-32 max-w-[calc(100vw-2rem)]" : "w-full",
            className,
          )}
          disabled={disabled}
          data-placeholder={selectedItem ? undefined : ""}
          onClick={(event) => {
            onClick?.(event);
            if (!event.defaultPrevented) setOpen((current) => !current);
          }}
          onKeyDown={handleKeyDown}
        >
          <span className="grid min-w-0 pl-3 pr-2">
            <span className="col-start-1 row-start-1 min-w-0 truncate" title={selectedText || undefined}>{selectedItem ? selectedLabel : placeholder}</span>
            {width === "content" ? <span aria-hidden="true" className="invisible col-start-1 row-start-1 grid max-w-64">
              {items.map((item) => <span key={item.props.value} className="col-start-1 row-start-1 whitespace-nowrap">{item.props.textValue ?? getNodeText(item.props.children)}</span>)}
            </span> : null}
          </span>
          <span className={cn("flex w-10 shrink-0 items-center justify-center border-l border-[var(--ui-border-subtle)] text-[var(--ui-text-muted)]", size === "compact" ? "h-6" : "h-7")}>
            <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </span>
        </button>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal container={portalContainer}>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-[70] box-border w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (document.activeElement === document.body) triggerRef.current?.focus({ preventScroll: true });
          }}
        >
          <div
            id={listboxId}
            role="listbox"
            aria-required={required || undefined}
            className="max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-auto p-1"
          >
            {children}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
      {name ? <select
        aria-hidden="true"
        className="pointer-events-none absolute size-px overflow-hidden whitespace-nowrap opacity-0"
        disabled={disabled}
        name={name}
        required={required}
        tabIndex={-1}
        value={selectedValue ?? ""}
        onChange={(event) => choose(event.target.value)}
        onInvalid={(event) => {
          event.preventDefault();
          setRequiredInvalid(true);
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <option value="" />
        {items.map((item) => <option key={item.props.value} value={item.props.value} disabled={item.props.disabled}>{item.props.textValue ?? getNodeText(item.props.children)}</option>)}
      </select> : null}
    </PopoverPrimitive.Root>
  </SelectContext.Provider>;
});
Select.displayName = "Select";

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(function SelectItem({ children, className, disabled, onClick, onPointerMove, textValue, value, ...props }, ref) {
  void textValue;
  const context = React.useContext(SelectContext);
  if (!context) return null;
  const isSelected = context.selectedValue === value;
  const isHighlighted = context.highlightedValue === value;
  return <div
    ref={ref}
    id={context.getItemId(value)}
    role="option"
    aria-disabled={disabled || undefined}
    aria-selected={isSelected}
    data-highlighted={isHighlighted ? "" : undefined}
    data-state={isSelected ? "checked" : "unchecked"}
    className={cn(
      "grid min-h-9 w-full min-w-0 cursor-default select-none grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] py-2 pl-2 pr-3 text-sm leading-5 text-[var(--ui-text-secondary)] outline-none aria-disabled:pointer-events-none aria-disabled:opacity-45 data-[highlighted]:bg-[var(--ui-surface-muted)] data-[highlighted]:text-[var(--ui-text)] data-[state=checked]:font-medium data-[state=checked]:text-[var(--ui-text)]",
      className,
    )}
    onPointerMove={(event) => {
      onPointerMove?.(event);
      if (!event.defaultPrevented && !disabled) context.onHighlight(value);
    }}
    onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented && !disabled) context.onSelect(value);
    }}
    {...props}
  >
    <span className="flex size-4 items-center justify-center text-[var(--ui-text)]">{isSelected ? <Check aria-hidden="true" className="size-3.5" /> : null}</span>
    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-normal break-normal [overflow-wrap:normal] sm:whitespace-nowrap">{children}</span>
  </div>;
});
SelectItem.displayName = "SelectItem";

export { Select, SelectItem };
