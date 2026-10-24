const deskTimeZone = "America/Port_of_Spain";

/** Calendar month in Trinidad and Tobago, `YYYY-MM`. */
export function currentDeskMonth(now = new Date()) {
  return now
    .toLocaleDateString("en-CA", { timeZone: deskTimeZone })
    .slice(0, 7);
}

export function shiftDeskMonth(month: string, delta: number) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error("Choose a month.");
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  const year = shifted.getUTCFullYear();
  const mon = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${mon}`;
}

export function deskMonthLabel(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return month;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
}
