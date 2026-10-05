import { listWorkEntries } from "@/lib/db";
import type { WorkEntry } from "@/lib/model";
import { technicianHours } from "@/lib/reporting";
import Link from "next/link";
import { masterHref } from "@/lib/desk-filters";

export const dynamic = "force-dynamic";

export default async function StatisticsPage() {
  const entries = await listWorkEntries();
  const dated = entries
    .filter((entry) => entry.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const withHours = entries.filter((entry) => entry.hours != null);
  const hours = withHours.reduce((sum, entry) => sum + (entry.hours ?? 0), 0);
  const revenue = entries.reduce((sum, entry) => sum + (entry.revenue ?? 0), 0);
  const customers = new Set(
    entries.map((entry) => entry.customer).filter(Boolean),
  );
  const techs = new Set(
    entries
      .flatMap((entry) => [entry.technician, entry.secondaryTech])
      .filter(Boolean),
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Statistics</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {dated.length
            ? `${formatDay(dated[0].date)} through ${formatDay(dated[dated.length - 1].date)}.`
            : "No dated work orders yet."}{" "}
          Hours count only when both arrival and departure are filled.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-sm text-muted-foreground">
          Import or enter a month before these counts have anything to show.
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Work orders" value={String(entries.length)} />
            <Stat
              label="Hours on site"
              value={hours.toFixed(1)}
              detail={`${withHours.length} timed jobs`}
            />
            <Stat label="Customers" value={String(customers.size)} />
            <Stat
              label="Technicians"
              value={String(techs.size)}
              detail={`Revenue $${revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            />
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <CountTable
              title="By job status"
              filter="status"
              rows={counts(entries, (entry) => entry.jobStatus || "Blank")}
            />
            <CountTable
              title="By service type"
              filter="service"
              rows={counts(entries, (entry) => entry.serviceType || "Blank")}
            />
          </div>
          <CountTable
            title="Hours by technician"
            filter="technician"
            rows={technicianHours(entries)}
            valueLabel="Hours"
          />
          <p className="text-sm text-muted-foreground">
            Technician hours include primary and secondary assignments. Each
            technician receives the full visit duration; hours on site count
            each visit once.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
    </div>
  );
}

function CountTable({
  title,
  rows,
  valueLabel = "Jobs",
  filter,
}: {
  title: string;
  rows: { label: string; value: string }[];
  valueLabel?: string;
  filter:"status"|"service"|"technician";
}) {
  return (
    <section className="rounded-xl border bg-card">
      <h2 className="border-b px-4 py-3 text-base font-semibold">{title}</h2>
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t">
              <td className="px-4 py-2"><Link className="text-primary underline underline-offset-2" href={masterHref({[filter]:row.label==='Blank'?'__blank__':row.label})}>{row.label}</Link></td>
              <td className="px-4 py-2"><Link className="text-primary underline underline-offset-2" href={masterHref({[filter]:row.label==='Blank'?'__blank__':row.label})}>{row.value}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function counts(entries: WorkEntry[], labelOf: (entry: WorkEntry) => string) {
  const map = new Map<string, number>();
  for (const entry of entries)
    map.set(labelOf(entry), (map.get(labelOf(entry)) ?? 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value: String(value) }));
}

function formatDay(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
