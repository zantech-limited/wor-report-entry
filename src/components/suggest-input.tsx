"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SuggestInputProps = {
  id: string;
  label: string;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  hint?: string;
  className?: string;
};

export function SuggestInput({
  id,
  label,
  value,
  suggestions,
  onChange,
  onCommit,
  onFocus,
  placeholder,
  hint,
  className,
}: SuggestInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    const matched = query
      ? suggestions.filter((item) => item.toLowerCase().includes(query))
      : suggestions;
    return matched.slice(0, 8);
  }, [suggestions, value]);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  const exact = suggestions.some(
    (item) => item.toLowerCase() === value.trim().toLowerCase(),
  );
  const showNew =
    open && value.trim().length > 0 && filtered.length === 0;

  function pick(next: string) {
    onChange(next);
    onCommit(next);
    setOpen(false);
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className={cn("relative", open && "z-20")}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[highlight] ? `${listId}-${highlight}` : undefined
        }
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        className={cn("h-10 sm:h-9", className)}
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
            setHighlight((current) =>
              Math.min(current + 1, Math.max(filtered.length - 1, 0)),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => Math.max(current - 1, 0));
          } else if (
            event.key === "Enter" &&
            open &&
            filtered[highlight] &&
            !event.ctrlKey &&
            !event.metaKey
          ) {
            event.preventDefault();
            pick(filtered[highlight]);
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
          className="absolute top-full z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        >
          {filtered.map((item, index) => (
            <li
              id={`${listId}-${index}`}
              key={item}
              role="option"
              aria-selected={index === highlight}
              className={cn(
                "cursor-pointer rounded-md px-2 py-1.5",
                index === highlight && "bg-accent text-accent-foreground",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => pick(item)}
            >
              {item}
            </li>
          ))}
          {value.trim() && !exact && filtered.length > 0 && (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              Enter selects the highlighted name. Tab keeps what you typed.
            </li>
          )}
        </ul>
      )}
      </div>
      {showNew && (
        <p className="text-xs text-muted-foreground">
          New name. It is remembered the next time you save.
        </p>
      )}
      {hint && !showNew && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
