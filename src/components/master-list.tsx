"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw } from "lucide-react";
import type { WorkEntry } from "@/lib/model";
import { monthLabelFromDate } from "@/lib/model";
import { matchesDeskFilters, type DeskFilters } from "@/lib/desk-filters";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function MasterList({ entries,initialFilters={} }: { entries: WorkEntry[];initialFilters?:DeskFilters }) {
  const [linkedFilters,setLinkedFilters]=useState<DeskFilters>({...initialFilters,technician:undefined,status:undefined,month:undefined,service:undefined});
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(initialFilters.month==='undated'?'Undated':initialFilters.month?monthLabelFromDate(`${initialFilters.month}-01`):"");
  const [tech, setTech] = useState(initialFilters.technician??"");
  const [status, setStatus] = useState(initialFilters.status??"");
  const [service,setService]=useState(initialFilters.service??"");
  const [sort, setSort] = useState<{ key: keyof WorkEntry; direction: 1 | -1 }>(
    { key: "date", direction: -1 },
  );
  const filtered = !!(query || month || tech || status || service || Object.values(linkedFilters).some(Boolean));
  function resetFilters() {
    setLinkedFilters({});
    setService('');
    setQuery("");
    setMonth("");
    setTech("");
    setStatus("");
  }
  function changeSort(key: keyof WorkEntry) {
    setSort((current) => ({
      key,
      direction: current.key === key ? (current.direction === 1 ? -1 : 1) : 1,
    }));
  }

  const months = useMemo(
    () =>
      unique(
        [...entries
          .map((entry) => entry.monthLabel)
          .filter((item) => item !== "Month not set"),...(entries.some(entry=>!entry.date)?['Undated']:[])],
      ),
    [entries],
  );
  const techs = useMemo(
    () =>
      unique(
        entries
          .flatMap((entry) => [entry.technician, entry.secondaryTech])
          .filter(Boolean),
      ),
    [entries],
  );
  const statuses = useMemo(
    () => unique(entries.map((entry) => entry.jobStatus || '__blank__')),
    [entries],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries
      .filter((entry) => {
        if(!matchesDeskFilters(entry,linkedFilters)) return false;
        if (month && (month==='Undated'?!!entry.date:entry.monthLabel !== month)) return false;
        if (tech && entry.technician !== tech && entry.secondaryTech !== tech)
          return false;
        if (status && entry.jobStatus !== (status==='__blank__'?'':status)) return false;
        if(service && entry.serviceType!==(service==='__blank__'?'':service)) return false;
        if (!needle) return true;
        return [
          entry.customer,
          entry.location,
          entry.wor,
          entry.serialNo,
          entry.modelNo,
          entry.technician,
          entry.secondaryTech,
          entry.no,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        const left = a[sort.key];
        const right = b[sort.key];
        if (left == null || left === "")
          return right == null || right === "" ? 0 : 1;
        if (right == null || right === "") return -1;
        const comparison =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), undefined, {
                numeric: true,
                sensitivity: "base",
              });
        return comparison * sort.direction;
      });
  }, [entries, month, query, status, tech, sort,linkedFilters,service]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Master</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Every saved work order. Search, narrow the list, then open a row to
          edit it.
        </p>
      </header>
      {Object.values(linkedFilters).some(Boolean) && <p className="rounded-xl border bg-accent p-4 text-sm">Linked filters: {Object.entries(linkedFilters).filter(([,value])=>value).map(([key,value])=>`${key}: ${value==='__blank__'?'Blank':value}`).join(' · ')}. Clear filters to view all work orders.</p>}

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
        <Filter
          id="master-month"
          label="Month"
          value={month}
          options={months}
          onChange={setMonth}
        />
        <Filter
          id="master-tech"
          label="Technician"
          value={tech}
          options={techs}
          onChange={setTech}
        />
        <Filter
          id="master-status"
          label="Job status"
          value={status}
          options={statuses}
          onChange={setStatus}
        />
        <Filter id="master-service" label="Service type" value={service} options={unique(entries.map(entry=>entry.serviceType||'__blank__'))} onChange={setService}/>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          aria-live="polite"
          className="text-sm tabular-nums text-muted-foreground"
        >
          {visible.length} of {entries.length} work orders
        </p>
        {filtered && (
          <Button type="button" variant="ghost" onClick={resetFilters}>
            <RotateCcw aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-sm text-muted-foreground">
          {entries.length === 0
            ? "No saved work orders yet. Import a workbook or start a month in Entry."
            : "Nothing matches those filters. Clear them to see all work orders."}
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
                  <span className="block font-medium">
                    {entry.customer || "No customer"}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {entry.date || entry.monthLabel} ·{" "}
                    {entry.location || "No site"} ·{" "}
                    {entry.serialNo || "No serial"}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {entry.technician || "No technician"} ·{" "}
                    {entry.jobStatus || "No status"}
                    {entry.hours != null
                      ? ` · ${entry.hours.toFixed(2)} h`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  {(
                    [
                      ["customer", "Customer"],
                      ["date", "Date"],
                      ["location", "Location"],
                      ["serialNo", "Serial"],
                      ["technician", "Technician"],
                      ["jobStatus", "Status"],
                      ["hours", "Hours"],
                    ] as [keyof WorkEntry, string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={
                        sort.key === key
                          ? sort.direction === 1
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="px-4 py-3 font-medium"
                    >
                      <button
                        type="button"
                        onClick={() => changeSort(key)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded text-left hover:text-foreground"
                      >
                        {label}
                        {sort.key !== key ? (
                          <ArrowUpDown className="size-3" aria-hidden="true" />
                        ) : sort.direction === 1 ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr
                    key={`${entry.reportId}-${entry.lineIndex}`}
                    className="border-b last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/?report=${entry.reportId}&line=${entry.lineIndex}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {entry.customer || "No customer"}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {entry.wor ? `WOR ${entry.wor}` : "No WOR"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.date || entry.monthLabel}
                    </td>
                    <td className="px-4 py-3">{entry.location || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">
                        {entry.serialNo || "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.modelNo}
                      </span>
                    </td>
                    <td className="px-4 py-3">{entry.technician || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${entry.jobStatus === "Completed" ? "bg-emerald-50 text-emerald-800" : entry.jobStatus === "Awaiting Parts" ? "bg-amber-50 text-amber-900" : "bg-muted text-foreground"}`}
                      >
                        {entry.jobStatus || "No status"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {entry.hours == null ? "—" : entry.hours.toFixed(2)}
                    </td>
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
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option==='__blank__'?'Blank':option}
          </option>
        ))}
      </select>
    </div>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
