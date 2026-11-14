"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterOptions, groupOptions, type StructureOption } from "./structure-options";

export type { StructureOption };

function useIsDesktop(): boolean {
  // Defaults to the mobile layout so the first paint (and SSR) never assumes a wide
  // viewport. Only the overlay differs, so there is nothing to hydrate-mismatch.
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isDesktop;
}

function OptionList({
  options,
  value,
  onSelect,
  emptyLabel,
  countLabel,
}: {
  options: StructureOption[];
  value: string;
  onSelect: (id: number) => void;
  emptyLabel: string;
  countLabel: string;
}) {
  if (options.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
    );
  }

  return (
    <>
      <p aria-live="polite" className="px-3 py-2 text-xs text-muted-foreground">
        {options.length === 1 ? `1 ${countLabel}` : `${options.length} ${countLabel}s`}
      </p>
      <div className="max-h-[min(52vh,26rem)] overflow-y-auto overscroll-contain">
        {groupOptions(options).map((section, index) => (
          <div key={section.group ?? `section-${index}`}>
            {section.group ? (
              <p className="sticky top-0 z-10 bg-popover px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {section.group}
              </p>
            ) : null}
            {section.options.map((option) => {
              const selected = String(option.id) === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelect(option.id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                    selected && "bg-accent/60 font-medium",
                  )}
                >
                  <span className="min-w-0 flex-1 wrap-break-word">{option.label}</span>
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function SearchBox({
  placeholder,
  query,
  onQueryChange,
  onEnter,
}: {
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  onEnter: () => void;
}) {
  return (
    <div className="border-b p-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnter();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus
          className="h-11 min-h-[44px] pl-8"
        />
      </div>
    </div>
  );
}

/**
 * One searchable select for every academic-structure field (faculty, department, level).
 *
 * Mobile gets a bottom sheet and desktop gets a popover, because a 114-row department list
 * inside a narrow popover is what made onboarding unusable on a phone. Both share the same
 * pinned search box, the same sticky section headers, and the same result count.
 */
export function StructurePicker({
  id,
  label,
  placeholder,
  value,
  onChange,
  options,
  loading,
  disabled,
  emptyLabel = "No matches.",
  countLabel = "result",
  searchPlaceholder,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: StructureOption[];
  loading?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  /** Singular noun used in the "N results" count, e.g. "department". */
  countLabel?: string;
  searchPlaceholder?: string;
}) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => String(option.id) === value);
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);

  // Cleared when the overlay opens rather than in an effect on close: a closed picker has
  // nothing to reset visually, and setting state inside an effect only costs a re-render.
  function openPicker() {
    setQuery("");
    setOpen(true);
  }

  function select(optionId: number) {
    onChange(String(optionId));
    setOpen(false);
  }

  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-label={label}
      disabled={disabled || loading}
      onClick={openPicker}
      className={cn(
        "h-11 min-h-[44px] w-full min-w-0 justify-between bg-transparent px-3 py-2 text-sm font-normal",
        !selected && "text-muted-foreground",
      )}
    >
      <span className="truncate text-left">
        {loading ? "Loading…" : (selected?.label ?? placeholder)}
      </span>
      <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
    </Button>
  );

  const searchBox = (
    <SearchBox
      placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
      query={query}
      onQueryChange={setQuery}
      onEnter={() => {
        if (filtered.length === 1) select(filtered[0].id);
      }}
    />
  );

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>

      {isDesktop ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
          >
            {searchBox}
            <OptionList
              options={filtered}
              value={value}
              onSelect={select}
              emptyLabel={emptyLabel}
              countLabel={countLabel}
            />
          </PopoverContent>
        </Popover>
      ) : (
        <>
          {trigger}
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerContent className="max-h-[88dvh]">
              <DrawerHeader className="border-b pb-3 text-left">
                <DrawerTitle className="text-left">{label}</DrawerTitle>
                <DrawerDescription className="truncate text-left">
                  {selected?.label ?? placeholder}
                </DrawerDescription>
              </DrawerHeader>
              {searchBox}
              <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
                <OptionList
                  options={filtered}
                  value={value}
                  onSelect={select}
                  emptyLabel={emptyLabel}
                  countLabel={countLabel}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}
    </div>
  );
}
