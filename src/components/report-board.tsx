"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { filterReportEntries, technicianJobs } from "@/lib/reporting";
import type { WorkEntry } from "@/lib/model";
import Link from "next/link";
import { masterHref, type DeskFilters } from "@/lib/desk-filters";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ReportBoard({ entries }: { entries: WorkEntry[] }) {
  const techs = useMemo(
    () =>
      unique(
        entries
          .flatMap((entry) => [entry.technician, entry.secondaryTech])
          .filter(Boolean),
      ),
    [entries],
  );
  const customers = useMemo(
    () => unique(entries.map((entry) => entry.customer).filter(Boolean)),
    [entries],
  );
  const [tech, setTech] = useState(techs[0] ?? "");
  const [customer, setCustomer] = useState(customers[0] ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [includeUndated, setIncludeUndated] = useState(true);
  const [showGraphs, setShowGraphs] = useState(true);
  const [metric, setMetric] = useState<"jobs" | "hours">("jobs");
  const href=(filters:DeskFilters)=>masterHref({from:start,to:end,undated:String(includeUndated),...filters});
  const filtered = useMemo(
    () => filterReportEntries(entries, start, end, includeUndated),
    [entries, start, end, includeUndated],
  );

  const techJobs = technicianJobs(filtered, tech);
  const assisted = filtered.filter(
    (entry) => entry.secondaryTech === tech && entry.technician !== tech,
  );
  const customerJobs = filtered.filter((entry) => entry.customer === customer);
  const months = monthRows(filtered);
  const services = [
    ...filtered.reduce(
      (map, entry) =>
        map.set(
          entry.serviceType || "Unspecified",
          (map.get(entry.serviceType || "Unspecified") ?? 0) + 1,
        ),
      new Map<string, number>(),
    ),
  ].sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          A technician’s jobs, a customer’s jobs, and the month-by-month totals
          from the saved work orders.
        </p>
      </header>

      <section
        aria-label="Report date range"
        className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="reports-from">From date</Label>
            <Input
              id="reports-from"
              type="date"
              className="h-11 text-base"
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                if (event.target.value) setIncludeUndated(false);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reports-to">To date</Label>
            <Input
              id="reports-to"
              type="date"
              className="h-11 text-base"
              value={end}
              onChange={(event) => {
                setEnd(event.target.value);
                if (event.target.value) setIncludeUndated(false);
              }}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                setStart("");
                setEnd("");
                setIncludeUndated(true);
              }}
            >
              All dates
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeUndated}
              onChange={(event) => setIncludeUndated(event.target.checked)}
            />
            Include undated work orders
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showGraphs}
              onChange={(event) => setShowGraphs(event.target.checked)}
            />
            Show graphs
          </label>
        </div>
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {filtered.length} of {entries.length} work orders in range. Dates
          include both endpoints. Every summary and graph below uses this range.
        </p>
        {start && end && start > end && (
          <p role="alert" className="text-sm text-destructive">
            From date must be on or before To date.
          </p>
        )}
      </section>

      {showGraphs && (
        <section
          className="grid gap-4 lg:grid-cols-2"
          aria-label="Graphs for the selected date range"
        >
          <div className="grid gap-4 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">By month</h2>
              <div className="flex items-center gap-2">
                <Label htmlFor="graph-metric">Measure</Label>
                <select
                  id="graph-metric"
                  value={metric}
                  className="min-h-10 rounded-md border bg-card px-2 text-sm"
                  onChange={(event) =>
                    setMetric(event.target.value as "jobs" | "hours")
                  }
                >
                  <option value="jobs">Work orders</option>
                  <option value="hours">Hours on site</option>
                </select>
              </div>
            </div>
            <BarGraph
              rows={months
                .slice(0, 12)
                .reverse()
                .map((row) => ({ label: row.month, value: row[metric],href:href({month:row.key==='Undated'?'undated':row.key}) }))}
              unit={metric === "hours" ? "h" : "jobs"}
            />
            <p className="text-xs text-muted-foreground">
              All technicians and customers in range; most recent 12 months.
              Hours require both times.
            </p>
          </div>
          <div className="grid gap-4 rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Service type mix</h2>
            <BarGraph
              rows={services
                .slice(0, 10)
                .map(([label, value]) => ({ label, value,href:href({service:label==='Unspecified'?'__blank__':label}) }))}
              unit="jobs"
            />
            <p className="text-xs text-muted-foreground">
              All work orders in range; top 10 service types.
            </p>
          </div>
        </section>
      )}

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="grid max-w-md gap-1.5">
          <Label htmlFor="report-tech">Technician</Label>
          <select
            id="report-tech"
            className={selectClass}
            value={tech}
            onChange={(event) => setTech(event.target.value)}
          >
            {techs.length === 0 && <option value="">No technicians yet</option>}
            {techs.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {tech ? (
          <Summary
            title={`${tech}`}
            href={href({technician:tech})}
            jobs={techJobs.length}
            hours={sumHours(techJobs)}
            customers={
              new Set(techJobs.map((entry) => entry.customer).filter(Boolean))
                .size
            }
            note={`${assisted.length} jobs as secondary tech included in jobs and hours. Shared visits credit the full on-site duration to each technician.`}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No technician names on file.
          </p>
        )}
        <JobTable
          entries={techJobs.slice(0, 12)}
          empty="No jobs for this technician."
        />
        <Link className="text-sm text-primary underline" href={href({technician:tech})}>View all {techJobs.length} technician work orders</Link>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="grid max-w-md gap-1.5">
          <Label htmlFor="report-customer">Customer</Label>
          <select
            id="report-customer"
            className={selectClass}
            value={customer}
            onChange={(event) => setCustomer(event.target.value)}
          >
            {customers.length === 0 && (
              <option value="">No customers yet</option>
            )}
            {customers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        {customer ? (
          <Summary
            title={customer}
            href={href({customer})}
            jobs={customerJobs.length}
            hours={sumHours(customerJobs)}
            customers={
              new Set(
                customerJobs.map((entry) => entry.serialNo).filter(Boolean),
              ).size
            }
            customersLabel="Machines"
            note={`${new Set(customerJobs.map((entry) => entry.location).filter(Boolean)).size} sites · ${new Set(customerJobs.map((entry) => entry.technician).filter(Boolean)).size} technicians`}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No customers on file.</p>
        )}
        <JobTable
          entries={customerJobs.slice(0, 12)}
          empty="No jobs for this customer."
        />
        <Link className="text-sm text-primary underline" href={href({customer})}>View all {customerJobs.length} customer work orders</Link>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-base font-semibold">By month</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Month</th>
                <th className="px-4 py-2 font-medium">Jobs</th>
                <th className="px-4 py-2 font-medium">Hours</th>
                <th className="px-4 py-2 font-medium">Customers</th>
              </tr>
            </thead>
            <tbody>
              {months.map((row) => (
                <tr key={row.month} className="border-t">
                  <td className="px-4 py-2"><Link className="text-primary underline" href={href({month:row.key==='Undated'?'undated':row.key})}>{row.month}</Link></td>
                  <td className="px-4 py-2"><Link className="text-primary underline" href={href({month:row.key==='Undated'?'undated':row.key})}>{row.jobs}</Link></td>
                  <td className="px-4 py-2"><Link className="text-primary underline" href={href({month:row.key==='Undated'?'undated':row.key})}>{row.hours.toFixed(1)}</Link></td>
                  <td className="px-4 py-2"><Link className="text-primary underline" href={href({month:row.key==='Undated'?'undated':row.key})}>{row.customers}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Summary({
  title,
  jobs,
  hours,
  customers,
  customersLabel = "Customers",
  note,
  href,
}: {
  title: string;
  jobs: number;
  hours: number;
  customers: number;
  customersLabel?: string;
  note?: string;
  href:string;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold"><Link className="text-primary underline" href={href}>{title}</Link></h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Jobs</dt>
          <dd className="text-2xl font-semibold"><Link className="text-primary underline" href={href}>{jobs}</Link></dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Hours</dt>
          <dd className="text-2xl font-semibold"><Link className="text-primary underline" href={href}>{hours.toFixed(1)}</Link></dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{customersLabel}</dt>
          <dd className="text-2xl font-semibold"><Link className="text-primary underline" href={href}>{customers}</Link></dd>
        </div>
      </dl>
      {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

function BarGraph({
  rows,
  unit,
}: {
  rows: { label: string; value: number;href:string }[];
  unit: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length)
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No work orders in this date range.
      </p>
    );
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li
          key={row.label}
        >
          <Link href={row.href} className="grid grid-cols-[100px_1fr_65px] items-center gap-3 rounded-md p-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" aria-label={`View ${row.label}: ${row.value} ${unit}`}>
          <span className="truncate text-xs" title={row.label}>
            {row.label}
          </span>
          <div
            className="h-5 overflow-hidden rounded bg-muted"
            aria-hidden="true"
          >
            <div
              className="h-full rounded bg-primary/80"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <span className="text-right text-xs tabular-nums text-muted-foreground">
            {unit === "h" ? row.value.toFixed(1) : row.value} {unit}
          </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function JobTable({ entries, empty }: { entries: WorkEntry[]; empty: string }) {
  if (!entries.length)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Customer</th>
            <th className="py-2 pr-3 font-medium">Location</th>
            <th className="py-2 font-medium">Hours</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={`${entry.reportId}-${entry.lineIndex}`}
              className="border-t"
            >
              <td className="py-2 pr-3"><Link className="text-primary underline" href={`/?report=${entry.reportId}&line=${entry.lineIndex}`}>{entry.date || "—"}</Link></td>
              <td className="py-2 pr-3"><Link className="text-primary underline" href={`/?report=${entry.reportId}&line=${entry.lineIndex}`}>{entry.customer || "—"}</Link></td>
              <td className="py-2 pr-3">{entry.location || "—"}</td>
              <td className="py-2">
                {entry.hours == null ? "—" : entry.hours.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function monthRows(entries: WorkEntry[]) {
  const map = new Map<
    string,
    { jobs: number; hours: number; customers: Set<string> }
  >();
  for (const entry of entries) {
    const key = entry.date ? entry.date.slice(0, 7) : "Undated";
    const row = map.get(key) ?? {
      jobs: 0,
      hours: 0,
      customers: new Set<string>(),
    };
    row.jobs += 1;
    row.hours += entry.hours ?? 0;
    if (entry.customer) row.customers.add(entry.customer);
    map.set(key, row);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, row]) => ({
      key,
      month: key === "Undated" ? key : labelMonth(key),
      jobs: row.jobs,
      hours: row.hours,
      customers: row.customers.size,
    }));
}

function labelMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function sumHours(entries: WorkEntry[]) {
  return entries.reduce((sum, entry) => sum + (entry.hours ?? 0), 0);
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
