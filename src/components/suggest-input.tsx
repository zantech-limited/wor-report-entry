"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SuggestOption = {
  value: string;
  label?: string;
  description?: string;
};

type SuggestInputProps = {
  id: string;
  label: string;
  value: string;
  suggestions: Array<string | SuggestOption>;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onPick?: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  hint?: string;
  className?: string;
  limit?: number;
};

function asOption(item: string | SuggestOption): Required<Pick<SuggestOption, "value" | "label">> & SuggestOption {
  if (typeof item === "string") return { value: item, label: item };
  return { ...item, label: item.label ?? item.value };
}

export function SuggestInput({
  id,
  label,
  value,
  suggestions,
  onChange,
  onCommit,
  onPick,
  onFocus,
  placeholder,
  hint,
  className,
  limit = 8,
}: SuggestInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const options = useMemo(() => suggestions.map(asOption), [suggestions]);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    const matched = query
      ? options.filter((item) =>
          `${item.label} ${item.value} ${item.description ?? ""}`.toLowerCase().includes(query),
        )
      : options;
    return matched.slice(0, limit);
  }, [options, value, limit]);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  const exact = options.some((item) => item.value.toLowerCase() === value.trim().toLowerCase());
  const showNew = open && value.trim().length > 0 && filtered.length === 0;

  function pick(next: string) {
    if (onPick) onPick(next);
    else {
      onChange(next);
      onCommit(next);
    }
    setOpen(false);
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className={cn("relative", open && "z-30")}>
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[highlight] ? `${listId}-${highlight}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          className={cn("h-11 text-base", className)}
          value={value}
          onFocus={() => {
            onFocus?.();
            setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
            onCommit(value);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlight((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setHighlight((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && open && filtered[highlight] && !event.ctrlKey && !event.metaKey) {
              event.preventDefault();
              pick(filtered[highlight].value);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && filtered.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute top-full z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
          >
            {filtered.map((item, index) => (
              <li
                id={`${listId}-${index}`}
                key={`${item.value}-${index}`}
                role="option"
                aria-selected={index === highlight}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-2",
                  index === highlight && "bg-accent text-accent-foreground",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(item.value)}
              >
                <span className="block font-medium">{item.label}</span>
                {item.description && (
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                )}
              </li>
            ))}
            {value.trim() && !exact && (
              <li className="px-2.5 py-1.5 text-xs text-muted-foreground">
                Enter picks the highlighted row. Tab keeps what you typed.
              </li>
            )}
          </ul>
        )}
      </div>
      {showNew && (
        <p className="text-sm text-muted-foreground">New entry. It is remembered when you save.</p>
      )}
      {hint && !showNew && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
