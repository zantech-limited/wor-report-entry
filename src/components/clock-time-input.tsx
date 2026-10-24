"use client";
import { useEffect, useState } from "react";
import {
  clockParts,
  formatClock12,
  formatStoredClock,
  type Meridiem,
} from "@/lib/clock-time";

type Draft = { hour: string; minute: string; meridiem: Meridiem | "" };

function fromValue(value: string): Draft {
  const parts = clockParts(value);
  if (!parts) return { hour: "", minute: "", meridiem: "" };
  return {
    hour: String(parts.hour12),
    minute: String(parts.minutes).padStart(2, "0"),
    meridiem: parts.meridiem,
  };
}

const selectClass =
  "min-h-11 w-full rounded-lg border bg-background px-3 text-base";

export function ClockTimeInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromValue(value));
  useEffect(() => setDraft(fromValue(value)), [value]);

  function commit(next: Draft) {
    setDraft(next);
    if (!next.hour || !next.minute || !next.meridiem) return;
    const stored = formatStoredClock(
      Number(next.hour),
      Number(next.minute),
      next.meridiem,
    );
    if (stored && stored !== value) onChange(stored);
  }

  const shown = formatClock12(value);
  const started = Boolean(value || draft.hour || draft.minute || draft.meridiem);
  return (
    <fieldset
      disabled={disabled}
      className="grid gap-2 text-sm disabled:opacity-60"
    >
      <legend className="font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          Hour
          <select
            id={id}
            aria-label={`${label} hour`}
            className={selectClass}
            value={draft.hour}
            onChange={(event) => commit({ ...draft, hour: event.target.value })}
          >
            <option value="">Hour</option>
            {Array.from({ length: 12 }, (_, index) => {
              const hour = String(index + 1);
              return (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              );
            })}
          </select>
        </label>
        <label className="grid gap-1">
          Minute
          <select
            id={`${id}-minute`}
            aria-label={`${label} minute`}
            className={selectClass}
            value={draft.minute}
            onChange={(event) =>
              commit({ ...draft, minute: event.target.value })
            }
          >
            <option value="">Min</option>
            {Array.from({ length: 60 }, (_, index) => {
              const minute = String(index).padStart(2, "0");
              return (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      <div
        className="grid grid-cols-2 gap-2"
        role="group"
        aria-label={`${label} AM or PM`}
      >
        {(["AM", "PM"] as const).map((flag) => (
          <button
            key={flag}
            type="button"
            aria-pressed={draft.meridiem === flag}
            className={`min-h-11 rounded-lg border text-base ${
              draft.meridiem === flag
                ? "bg-primary text-primary-foreground"
                : "bg-background"
            }`}
            onClick={() => commit({ ...draft, meridiem: flag })}
          >
            {flag}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {shown ||
          (started
            ? "Choose hour, minute, and AM or PM."
            : "No time selected")}
      </p>
      {started && (
        <button
          type="button"
          className="min-h-11 justify-self-start rounded-lg border px-4"
          onClick={() => {
            setDraft({ hour: "", minute: "", meridiem: "" });
            if (value) onChange("");
          }}
        >
          Clear time
        </button>
      )}
    </fieldset>
  );
}
