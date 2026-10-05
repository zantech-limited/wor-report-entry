"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import type { WorkEntry } from "@/lib/model";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ReportBoard({ entries }: { entries: WorkEntry[] }) {
  const techs = useMemo(() => unique(entries.map((entry) => entry.technician).filter(Boolean)), [entries]);
  const customers = useMemo(() => unique(entries.map((entry) => entry.customer).filter(Boolean)), [entries]);
  const [tech, setTech] = useState(techs[0] ?? "");
  const [customer, setCustomer] = useState(customers[0] ?? "");

  const techJobs = entries.filter((entry) => entry.technician === tech);
  const assisted = entries.filter((entry) => entry.secondaryTech === tech && entry.technician !== tech);
  const customerJobs = entries.filter((entry) => entry.customer === customer);
  const months = monthRows(entries);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          A technician’s jobs, a customer’s jobs, and the month-by-month totals from the saved work orders.
        </p>
      </header>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="grid max-w-md gap-1.5">
          <Label htmlFor="report-tech">Technician</Label>
          <select id="report-tech" className={selectClass} value={tech} onChange={(event) => setTech(event.target.value)}>
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
            jobs={techJobs.length}
            hours={sumHours(techJobs)}
            customers={new Set(techJobs.map((entry) => entry.customer).filter(Boolean)).size}
            note={assisted.length ? `${assisted.length} more jobs as secondary tech, not included in the hours.` : undefined}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No technician names on file.</p>
        )}
        <JobTable entries={techJobs.slice(0, 12)} empty="No jobs for this technician." />
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
            {customers.length === 0 && <option value="">No customers yet</option>}
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
            jobs={customerJobs.length}
            hours={sumHours(customerJobs)}
            customers={new Set(customerJobs.map((entry) => entry.serialNo).filter(Boolean)).size}
            customersLabel="Machines"
            note={`${new Set(customerJobs.map((entry) => entry.location).filter(Boolean)).size} sites · ${new Set(customerJobs.map((entry) => entry.technician).filter(Boolean)).size} technicians`}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No customers on file.</p>
        )}
        <JobTable entries={customerJobs.slice(0, 12)} empty="No jobs for this customer." />
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
                  <td className="px-4 py-2">{row.month}</td>
                  <td className="px-4 py-2">{row.jobs}</td>
                  <td className="px-4 py-2">{row.hours.toFixed(1)}</td>
                  <td className="px-4 py-2">{row.customers}</td>
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
}: {
  title: string;
  jobs: number;
  hours: number;
  customers: number;
  customersLabel?: string;
  note?: string;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Jobs</dt>
          <dd className="text-2xl font-semibold">{jobs}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Hours</dt>
          <dd className="text-2xl font-semibold">{hours.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{customersLabel}</dt>
          <dd className="text-2xl font-semibold">{customers}</dd>
        </div>
      </dl>
      {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

function JobTable({ entries, empty }: { entries: WorkEntry[]; empty: string }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
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
            <tr key={`${entry.reportId}-${entry.lineIndex}`} className="border-t">
              <td className="py-2 pr-3">{entry.date || "—"}</td>
              <td className="py-2 pr-3">{entry.customer || "—"}</td>
              <td className="py-2 pr-3">{entry.location || "—"}</td>
              <td className="py-2">{entry.hours == null ? "—" : entry.hours.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function monthRows(entries: WorkEntry[]) {
  const map = new Map<string, { jobs: number; hours: number; customers: Set<string> }>();
  for (const entry of entries) {
    const key = entry.date ? entry.date.slice(0, 7) : "Undated";
    const row = map.get(key) ?? { jobs: 0, hours: 0, customers: new Set<string>() };
    row.jobs += 1;
    row.hours += entry.hours ?? 0;
    if (entry.customer) row.customers.add(entry.customer);
    map.set(key, row);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, row]) => ({
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
