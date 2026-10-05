"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Part } from "@/lib/parts-model";
import type { PrefixEntry, ReportSummary } from "@/lib/model";

type Technician = { name: string; active: boolean };
type Kind = "parts" | "technicians" | "prefixes";
const titles = {
  parts: "Parts",
  technicians: "Technicians",
  prefixes: "Prefixes",
};
const descriptions = {
  parts:
    "Browse part numbers, descriptions, and usage counts for multiline entry.",
  technicians:
    "Browse technician dropdown names. Historical work orders stay intact when administrators edit the list.",
  prefixes:
    "Browse a month's three-character serial prefixes and model names.",
};
const emptyPart: Part = {
  partNo: "",
  description: "",
  defaultQty: "1",
  active: true,
};
async function api(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Could not load the catalog.");
  return data;
}
export function CatalogPage({ kind }: { kind: Kind }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [parts, setParts] = useState<Part[]>([]);
  const [partTotals, setPartTotals] = useState({ totalUses: 0, usedPartNumbers: 0 });
  const [part, setPart] = useState(emptyPart);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [name, setName] = useState("");
  const [oldName, setOldName] = useState("");
  const [prefixes, setPrefixes] = useState<PrefixEntry[]>([]);
  const [prefix, setPrefix] = useState("");
  const [model, setModel] = useState("");
  const [months, setMonths] = useState<ReportSummary[]>([]);
  const [reportId, setReportId] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const session = await api("/api/admin/session");
        setAllowed(session.authenticated);
        {
          const data = await api(`/api/admin/${kind}`);
          if (kind === "parts") {
            setParts(data.parts);
            setPartTotals({totalUses: data.totalUses, usedPartNumbers: data.usedPartNumbers});
          }
          if (kind === "technicians") setTechnicians(data.technicians);
          if (kind === "prefixes") {
            setPrefixes(data.prefixes);
            setMonths(data.reports);
            setReportId(data.reportId);
          }
        }
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not load this page.",
        );
      } finally {
        setReady(true);
      }
    })();
  }, [kind]);
  async function act(work: () => Promise<void>) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save changes.",
      );
    } finally {
      setPending(false);
    }
  }
  async function changeTechnician(next: Technician, original?: string) {
    const data = await api("/api/admin/technicians", {
      ...next,
      oldName: original,
    });
    setTechnicians(data.technicians);
    setName("");
    setOldName("");
    setMessage(
      next.active
        ? "Technician available in dropdowns. Reload Entry to refresh its lists."
        : "Technician removed from dropdowns. Historical work orders are unchanged.",
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {titles[kind]}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          {descriptions[kind]}
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        className={
          message ? "rounded-xl border bg-accent p-4 text-sm" : "sr-only"
        }
      >
        {message}
      </p>
      {!ready ? (
        <p>Loading catalog…</p>
      ) : (
        <>
          {kind === "parts" && (
            <section aria-label="Parts usage totals" className="grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-3">
              <p><strong className="block text-2xl">{parts.length}</strong> Catalog parts</p>
              <p><strong className="block text-2xl">{partTotals.usedPartNumbers}</strong> Different parts used</p>
              <p><strong className="block text-2xl">{partTotals.totalUses}</strong> Total part uses</p>
              <p className="text-xs text-muted-foreground sm:col-span-3">Across all saved workbooks. Each part line counts as one use, regardless of quantity. Search does not change these totals.</p>
            </section>
          )}
          {!allowed && (
            <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              Read-only view. <Link href="/admin" className="font-medium text-primary underline underline-offset-4">Unlock Admin</Link> to add or edit entries.
            </p>
          )}
          {allowed && kind === "parts" && (
            <form
              className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  const data = await api("/api/admin/parts", { ...part, consolidate: !!part.needsConsolidation });
                  setParts(data.parts);
                  setPart(emptyPart);
                  setMessage(
                    "Part saved. Reload Entry to refresh catalog suggestions.",
                  );
                });
              }}
            >
              <Field
                id="parts-number"
                label="Part number"
                value={part.partNo}
                onChange={(value) => setPart({ ...part, partNo: value })}
              />
              <div className="sm:col-span-2">
                <Field
                  id="parts-description"
                  label="Description"
                  value={part.description}
                  onChange={(value) => setPart({ ...part, description: value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={part.active}
                  onChange={(event) =>
                    setPart({ ...part, active: event.target.checked })
                  }
                />
                Available in suggestions
              </label>
              <div className="flex gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPart(emptyPart)}
                >
                  Clear
                </Button>
                <Button type="submit" disabled={pending}>Save part</Button>
              </div>
            </form>
          )}
          {allowed && kind === "technicians" && (
            <form
              className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-[1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                void act(() =>
                  changeTechnician(
                    { name, active: true },
                    oldName || undefined,
                  ),
                );
              }}
            >
              <Field
                id="technician-name"
                label={oldName ? "Edit dropdown name" : "New technician"}
                value={name}
                onChange={setName}
              />
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setName("");
                    setOldName("");
                  }}
                >
                  Clear
                </Button>
                <Button type="submit" disabled={pending || !name.trim()}>
                  {oldName ? "Save name" : "Add technician"}
                </Button>
              </div>
              {oldName && (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Renaming updates future suggestions. Historical visits retain
                  the name entered at the time.
                </p>
              )}
            </form>
          )}
          {kind === "prefixes" && (
            <section className="grid gap-4 rounded-xl border bg-card p-5">
              <div className="grid gap-1.5">
                <Label htmlFor="prefix-month">Month</Label>
                <select
                  id="prefix-month"
                  className="h-11 rounded-lg border bg-card px-3"
                  value={reportId}
                  disabled={pending}
                  onChange={(event) => {
                    const id = event.target.value;
                    void act(async () => {
                      const data = await api(
                        `/api/admin/prefixes?report=${encodeURIComponent(id)}`,
                      );
                      setReportId(data.reportId);
                      setPrefixes(data.prefixes);
                      setPrefix("");
                      setModel("");
                    });
                  }}
                >
                  {months.map((month) => (
                    <option key={month.id} value={month.id}>
                      {month.monthLabel} · {month.preparedBy || "No preparer"}
                    </option>
                  ))}
                </select>
              </div>
              {reportId && allowed ? (
                <form
                  className="grid gap-4 sm:grid-cols-[140px_1fr_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act(async () => {
                      const data = await api("/api/admin/prefixes", {
                        reportId,
                        prefix,
                        model,
                        action: "save",
                      });
                      setPrefixes(data.prefixes);
                      setPrefix("");
                      setModel("");
                      setMessage(
                        "Prefix saved for this month. Reload Entry to use the updated map.",
                      );
                    });
                  }}
                >
                  <Field
                    id="prefix-value"
                    label="Prefix"
                    value={prefix}
                    onChange={(value) =>
                      setPrefix(value.toUpperCase().slice(0, 3))
                    }
                  />
                  <Field
                    id="prefix-model"
                    label="Model"
                    value={model}
                    onChange={setModel}
                  />
                  <div className="flex items-end">
                    <Button
                      type="submit"
                      disabled={pending || prefix.length !== 3 || !model.trim()}
                    >
                      Save prefix
                    </Button>
                  </div>
                </form>
              ) : !reportId ? (
                <p className="text-sm text-muted-foreground">
                  Start or import a month in Entry first.
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                This map belongs to the selected month. Editing it does not
                rewrite model values already entered on work orders or other
                months.
              </p>
            </section>
          )}
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-48 flex-1">
              <Field
                id="catalog-filter"
                label={`Search ${titles[kind].toLowerCase()}`}
                value={search}
                onChange={setSearch}
              />
            </div>
            {kind !== "prefixes" && (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showRemoved}
                  onChange={(event) => setShowRemoved(event.target.checked)}
                />
                Show removed or archived
              </label>
            )}
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {kind === "parts" &&
              parts
                .filter(
                  (p) =>
                    (showRemoved || p.active) &&
                    `${p.partNo} ${p.description}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .map((p) => (
                  <li
                    key={p.partNo}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="font-mono text-sm font-semibold">
                        {p.partNo}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {p.description} · Used {p.usageCount ?? 0} {(p.usageCount ?? 0) === 1 ? "time" : "times"}
                        {!p.active ? " · Archived" : ""}
                      </p>
                      {p.needsConsolidation && (
                        <details className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                          <summary className="cursor-pointer font-medium">Different descriptions for this part number</summary>
                          <p className="mt-2 text-xs">Choose a preferred description for future work orders. Historical descriptions stay unchanged.</p>
                          <ul className="mt-2 space-y-2">
                            {p.descriptionVariants?.map(option => (
                              <li key={option.description} className="flex flex-wrap items-center justify-between gap-2">
                                <span>{option.description} · {option.count} uses</span>
                                {allowed && <Button type="button" variant="outline" disabled={pending} onClick={() => void act(async () => {
                                  const data = await api("/api/admin/parts", {...p, description: option.description, consolidate: true});
                                  setParts(data.parts);
                                  setMessage("Preferred description saved for future work orders. Reload Entry to refresh autofill.");
                                })}>Use this description</Button>}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    {allowed && (<div className="flex gap-2">
                      <Button variant="outline" onClick={() => setPart(p)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          void act(async () => {
                            const data = await api("/api/admin/parts", {
                              ...p,
                              active: !p.active,
                            });
                            setParts(data.parts);
                            setMessage(
                              p.active
                                ? "Part archived. Historical work orders are unchanged."
                                : "Part available in suggestions.",
                            );
                          })
                        }
                      >
                        {p.active ? "Archive" : "Restore"}
                      </Button>
                    </div>)}
                  </li>
                ))}
            {kind === "technicians" &&
              technicians
                .filter(
                  (t) =>
                    (showRemoved || t.active) &&
                    t.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((t) => (
                  <li
                    key={t.name}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      {!t.active && (
                        <p className="text-xs text-muted-foreground">
                          Removed from dropdowns
                        </p>
                      )}
                    </div>
                    {allowed && (<div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setOldName(t.name);
                          setName(t.name);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          void act(() =>
                            changeTechnician({ ...t, active: !t.active }),
                          )
                        }
                      >
                        {t.active
                          ? "Remove from dropdown"
                          : "Restore to dropdown"}
                      </Button>
                    </div>)}
                  </li>
                ))}
            {kind === "prefixes" &&
              prefixes
                .filter((p) =>
                  `${p.prefix} ${p.model}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .sort((a, b) => a.prefix.localeCompare(b.prefix))
                .map((p) => (
                  <li
                    key={p.prefix}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="font-mono text-sm font-semibold">
                        {p.prefix}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {p.model}
                      </p>
                    </div>
                    {allowed && (<div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPrefix(p.prefix);
                          setModel(p.model);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          void act(async () => {
                            const data = await api("/api/admin/prefixes", {
                              reportId,
                              prefix: p.prefix,
                              action: "remove",
                            });
                            setPrefixes(data.prefixes);
                            setMessage("Prefix removed from this month's map.");
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>)}
                  </li>
                ))}
            {(kind === "parts"
              ? parts.length === 0
              : kind === "technicians"
                ? technicians.length === 0
                : prefixes.length === 0) && (
              <li className="p-6 text-sm text-muted-foreground">
                No catalog entries yet. Add one above.
              </li>
            )}
          </ul>
          <p className="text-xs leading-5 text-muted-foreground">
            Catalog changes are included in portable backups. Reload an open
            Entry form after making changes here.
          </p>
        </>
      )}
    </div>
  );
}
function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        className="h-11 text-base"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
