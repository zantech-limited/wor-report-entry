"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkEntry } from "@/lib/model";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function MasterList({ entries }: { entries: WorkEntry[] }) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [tech, setTech] = useState("");
  const [status, setStatus] = useState("");

  const months = useMemo(() => unique(entries.map((entry) => entry.monthLabel).filter((item) => item !== "Month not set")), [entries]);
  const techs = useMemo(() => unique(entries.map((entry) => entry.technician).filter(Boolean)), [entries]);
  const statuses = useMemo(() => unique(entries.map((entry) => entry.jobStatus).filter(Boolean)), [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (month && entry.monthLabel !== month) return false;
      if (tech && entry.technician !== tech) return false;
      if (status && entry.jobStatus !== status) return false;
      if (!needle) return true;
      return [entry.customer, entry.location, entry.wor, entry.serialNo, entry.modelNo, entry.technician, entry.no]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [entries, month, query, status, tech]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Master</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Every saved work order. Search, narrow the list, then open a row to edit it.
        </p>
      </header>

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="master-search">Search</Label>
          <Input
            id="master-search"
            value={query}
            placeholder="Customer, serial, WOR"
            className="h-11 text-base"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Filter id="master-month" label="Month" value={month} options={months} onChange={setMonth} />
        <Filter id="master-tech" label="Technician" value={tech} options={techs} onChange={setTech} />
        <Filter id="master-status" label="Job status" value={status} options={statuses} onChange={setStatus} />
      </div>

      <p className="text-sm text-muted-foreground">
        {visible.length} of {entries.length} work orders
      </p>

      {visible.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-sm text-muted-foreground">
          Nothing matches those filters.
        </p>
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {visible.map((entry) => (
              <li key={`${entry.reportId}-${entry.lineIndex}`}>
                <Link
                  href={`/?report=${entry.reportId}&line=${entry.lineIndex}`}
                  className="block rounded-xl border bg-card px-4 py-3 hover:bg-accent"
                >
                  <span className="block font-medium">{entry.customer || "No customer"}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {entry.date || entry.monthLabel} · {entry.location || "No site"} · {entry.serialNo || "No serial"}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {entry.technician || "No technician"} · {entry.jobStatus || "No status"}
                    {entry.hours != null ? ` · ${entry.hours.toFixed(2)} h` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Serial</th>
                  <th className="px-4 py-3 font-medium">Technician</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={`${entry.reportId}-${entry.lineIndex}`} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/?report=${entry.reportId}&line=${entry.lineIndex}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {entry.customer || "No customer"}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{entry.wor ? `WOR ${entry.wor}` : "No WOR"}</span>
                    </td>
                    <td className="px-4 py-3">{entry.date || entry.monthLabel}</td>
                    <td className="px-4 py-3">{entry.location || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">{entry.serialNo || "—"}</span>
                      <span className="block text-xs text-muted-foreground">{entry.modelNo}</span>
                    </td>
                    <td className="px-4 py-3">{entry.technician || "—"}</td>
                    <td className="px-4 py-3">{entry.jobStatus || "—"}</td>
                    <td className="px-4 py-3">{entry.hours == null ? "—" : entry.hours.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Filter({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
