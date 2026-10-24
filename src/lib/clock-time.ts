export type Meridiem = "AM" | "PM";
export type ClockParts = { hour12: number; minutes: number; meridiem: Meridiem };

/** Parse a stored 24-hour clock. Empty and unparsed values stay out of the picker. */
export function clockParts(value: string): ClockParts | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return {
    hour12: hours % 12 || 12,
    minutes,
    meridiem: hours >= 12 ? "PM" : "AM",
  };
}

/** Display a stored HH:MM as 12-hour text. Unparsed text stays visible. */
export function formatClock12(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parts = clockParts(trimmed);
  if (!parts) return trimmed;
  return `${parts.hour12}:${String(parts.minutes).padStart(2, "0")} ${parts.meridiem}`;
}

/** Store a complete 12-hour selection as zero-padded 24-hour HH:MM. */
export function formatStoredClock(
  hour12: number,
  minutes: number,
  meridiem: Meridiem,
): string {
  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12) return "";
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return "";
  if (meridiem !== "AM" && meridiem !== "PM") return "";
  let hours = hour12 % 12;
  if (meridiem === "PM") hours += 12;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
