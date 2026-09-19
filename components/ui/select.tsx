"use client";

import * as React from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectProps {
  id?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  name?: string;
}

const SearchableSelect = React.forwardRef<
  HTMLInputElement,
  SearchableSelectProps
>(({ id, options, value, onChange, onBlur, placeholder, error, name }, ref) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(value);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setQuery(value);
  }, [value]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setQuery(value);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const filtered = React.useMemo(() => {
    if (!query) return options;
    return options.filter((option) =>
      option.toLowerCase().includes(query.toLowerCase())
    );
  }, [options, query]);

  function selectOption(option: string) {
    onChange(option);
    setQuery(option);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && filtered[activeIndex]) {
        selectOption(filtered[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(value);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <MapPin
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted dark:text-slate-500"
      />
      <input
        id={id}
        ref={ref}
        name={name}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-invalid={!!error}
        autoComplete="off"
        className={cn(
          "h-12 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-9 text-sm text-ink placeholder:text-slate-400 transition-colors duration-200 focus:border-bright-blue focus:outline-none focus:ring-2 focus:ring-bright-blue/20 dark:border-white/10 dark:bg-dark-surface-alt dark:text-slate-100 dark:placeholder:text-slate-500",
          error && "border-red-400 focus:border-red-500 focus:ring-red-100 dark:border-red-400/70"
        )}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setQuery(value);
          onBlur?.();
        }}
        onKeyDown={handleKeyDown}
      />
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-transform dark:text-slate-500",
          open && "rotate-180"
        )}
      />
      {open && filtered.length > 0 ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-card-hover dark:border-white/10 dark:bg-dark-surface-alt"
        >
          {filtered.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
              className={cn(
                "cursor-pointer px-3.5 py-2 text-sm text-ink hover:bg-light-blue dark:text-slate-200 dark:hover:bg-white/10",
                index === activeIndex && "bg-light-blue dark:bg-white/10",
                option === value && "font-semibold text-primary-blue dark:text-bright-blue"
              )}
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-500">{error}</p>
      ) : null}
    </div>
  );
});
SearchableSelect.displayName = "SearchableSelect";

export { SearchableSelect };
