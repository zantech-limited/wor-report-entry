"use client";
import { useId, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { applyPartLine, type Part } from "@/lib/parts-model";
import { cn } from "@/lib/utils";

type Values = { partNo: string; description: string; qty: string };
export function PartsInput({
  values,
  parts,
  onChange,
}: {
  values: Values;
  parts: Part[];
  onChange: (values: Values) => void;
}) {
  const listId = useId();
  const [row, setRow] = useState(0);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const query = (values.partNo.split("\n")[row] ?? "").trim().toLowerCase();
  const matches = parts
    .filter(
      (part) =>
        part.active &&
        query &&
        `${part.partNo} ${part.description}`.toLowerCase().includes(query),
    )
    .slice(0, 8);
  function pick(part: Part) {
    onChange(
      applyPartLine(values.partNo, values.description, values.qty, row, part),
    );
    setOpen(false);
  }
  function fillExact(partNo: string) {
    let next = { ...values, partNo };
    partNo.split("\n").forEach((number, index) => {
      const part = parts.find(
        (p) =>
          p.active && p.partNo.toLowerCase() === number.trim().toLowerCase(),
      );
      if (!part) {
        if (number.trim() && !/^n\s*\/\s*a$/i.test(number.trim())) {
          const quantities = next.qty.split("\n");
          while (quantities.length <= index) quantities.push("");
          if (!quantities[index].trim()) quantities[index] = "1";
          next = { ...next, qty: quantities.join("\n") };
        }
        return;
      }
      const description = next.description.split("\n")[index] ?? "";
      const qty = next.qty.split("\n")[index] ?? "";
      const filled = applyPartLine(next.partNo, next.description, next.qty, index, {
        ...part,
        description: description.trim() ? description : part.description,
      });
      next = { ...filled, qty: qty.trim() ? next.qty : filled.qty };
    });
    onChange(next);
  }
  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <Label htmlFor="line-part-no">Part No.</Label>
      <div className={cn("relative", open && "z-30")}>
        <Textarea
          id="line-part-no"
          value={values.partNo}
          rows={3}
          spellCheck={false}
          placeholder="One part number per line"
          aria-describedby={`${listId}-hint`}
          aria-controls={open && matches.length ? listId : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            fillExact(values.partNo);
          }}
          onClick={(event) => {
            setRow(
              event.currentTarget.value
                .slice(0, event.currentTarget.selectionStart)
                .split("\n").length - 1,
            );
            setHighlight(0);
            setOpen(true);
          }}
          onChange={(event) => {
            setRow(
              event.target.value
                .slice(0, event.target.selectionStart)
                .split("\n").length - 1,
            );
            setHighlight(0);
            setOpen(true);
            fillExact(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            else if (open && matches.length && event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((i) => Math.min(i + 1, matches.length - 1));
            } else if (open && matches.length && event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((i) => Math.max(i - 1, 0));
            } else if (
              open &&
              matches[highlight] &&
              event.key === "Enter" &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault();
              pick(matches[highlight]);
            }
          }}
        />
        {open && matches.length > 0 && (
          <ul
            id={listId}
            aria-label="Matching parts"
            className="absolute top-full z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-lg"
          >
            {matches.map((part, index) => (
              <li key={part.partNo}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm",
                    index === highlight && "bg-accent",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(part)}
                >
                  <span className="font-mono font-medium">{part.partNo}</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {part.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p
        id={`${listId}-hint`}
        className="text-xs leading-5 text-muted-foreground"
      >
        One part per line. Matching descriptions and quantities fill on the same
        line. Enter picks a suggestion; Alt+Enter adds a line. Tab keeps a new
        part number.
      </p>
    </div>
  );
}
