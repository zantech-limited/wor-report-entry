import type { WorkEntry } from "./model";
export function filterReportEntries(
  entries: WorkEntry[],
  start: string,
  end: string,
  includeUndated: boolean,
) {
  if (start && end && start > end) return [];
  return entries.filter((entry) =>
    entry.date
      ? (!start || entry.date >= start) && (!end || entry.date <= end)
      : includeUndated,
  );
}
export function technicianJobs(entries: WorkEntry[], technician: string) {
  return technician
    ? entries.filter(
        (entry) =>
          entry.technician === technician || entry.secondaryTech === technician,
      )
    : [];
}
export function technicianHours(entries: WorkEntry[]) {
  const map = new Map<string, number>();
  for (const entry of entries) {
    if (entry.hours == null) continue;
    for (const name of new Set(
      [entry.technician, entry.secondaryTech].filter(Boolean),
    ))
      map.set(name, (map.get(name) ?? 0) + entry.hours);
  }
  return [...map]
    .sort((a, b) => b[1] - a[1])
    .map(([label, hours]) => ({ label, value: hours.toFixed(1) }));
}
