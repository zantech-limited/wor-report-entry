"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MonthActions } from "@/components/month-actions";
import { SuggestInput } from "@/components/suggest-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FTF_VALUES,
  JOB_STATUSES,
  PARTS_REQUIRED,
  PAYMENT_METHODS,
  SERVICE_TYPES,
  SLA_TYPES,
  applyCustomerChange,
  blankLine,
  canonicalize,
  fileMonthStamp,
  formatHours,
  locationsFor,
  machinesFor,
  matchMachine,
  modelForSerial,
  nextLineNo,
  prefixOf,
  reportMonthLabel,
  timeTakenHours,
  type PrefixEntry,
  type Report,
  type ReportSummary,
  type Suggestions,
  type WorkOrder,
} from "@/lib/model";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type SaveStatus = "saved" | "unsaved" | "saving" | "error";
type Conflict = { prefix: string; existing: string; incoming: string };

export function ReportEditor({
  initial,
  initialSuggestions,
  initialIndex = 0,
  months = [],
}: {
  initial: Report;
  initialSuggestions: Suggestions;
  initialIndex?: number;
  months?: ReportSummary[];
}) {
  const router = useRouter();
  const [report, setReport] = useState(initial);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [index, setIndex] = useState(initialIndex);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ prefix: string; model: string } | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focusLine, setFocusLine] = useState(false);

  const latest = useRef(report);
  const suggestionsRef = useRef(suggestions);
  const indexRef = useRef(index);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  const noRef = useRef<HTMLInputElement>(null);
  const customerAtFocus = useRef("");
  const serialAtEdit = useRef("");
  const modelTouched = useRef(false);
  const locationTouched = useRef(false);
  const autofill = useRef({ model: "", location: "" });

  latest.current = report;
  suggestionsRef.current = suggestions;
  indexRef.current = index;

  const line = report.lines[index];
  const month = reportMonthLabel(report.lines);
  const sites = line ? locationsFor(line.customer, suggestions) : [];

  useEffect(() => {
    if (!focusLine) return;
    noRef.current?.focus();
    setFocusLine(false);
  }, [focusLine, index]);

  useEffect(() => {
    modelTouched.current = false;
    locationTouched.current = false;
    autofill.current = { model: "", location: "" };
    serialAtEdit.current = latest.current.lines[index]?.serialNo ?? "";
  }, [index]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        void persist();
      } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void saveAndNext();
      } else if (event.altKey && key === "n" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        addLine();
      } else if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Handlers read the latest report through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scheduleSave() {
    dirty.current = true;
    setStatus("unsaved");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void persist();
    }, 400);
  }

  async function persist(): Promise<boolean> {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) {
      dirty.current = true;
      return false;
    }
    if (!dirty.current && status !== "unsaved") return true;
    inFlight.current = true;
    dirty.current = false;
    setStatus("saving");
    setSaveError(null);
    const snapshot = latest.current;
    try {
      const response = await fetch(`/api/reports/${snapshot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      const body = (await response.json()) as { error?: string; suggestions?: Suggestions };
      if (!response.ok || !body.suggestions) {
        throw new Error(body.error || "The report could not be saved.");
      }
      setSuggestions(body.suggestions);
      setStatus("saved");
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The report could not be saved.";
      setSaveError(message);
      setStatus("error");
      dirty.current = true;
      toast.error(message);
      return false;
    } finally {
      inFlight.current = false;
      if (dirty.current) void persist();
    }
  }

  function patchLine(partial: Partial<WorkOrder>) {
    setReport((current) => {
      const lines = current.lines.slice();
      const currentLine = lines[indexRef.current];
      if (!currentLine) return current;
      lines[indexRef.current] = { ...currentLine, ...partial };
      return { ...current, lines };
    });
    scheduleSave();
  }

  function move(delta: number) {
    setIndex((current) => {
      const next = Math.min(Math.max(current + delta, 0), Math.max(latest.current.lines.length - 1, 0));
      if (next !== current) setFocusLine(true);
      return next;
    });
  }

  function addLine() {
    setReport((current) => ({
      ...current,
      lines: [...current.lines, blankLine(nextLineNo(current.lines))],
    }));
    setIndex(latest.current.lines.length);
    setFocusLine(true);
    setPrompt(null);
    scheduleSave();
  }

  function removeLine() {
    setReport((current) => {
      const lines = current.lines.filter((_, lineIndex) => lineIndex !== indexRef.current);
      return { ...current, lines };
    });
    setIndex((current) => Math.max(0, current - 1));
    setConfirmDelete(false);
    setPrompt(null);
    scheduleSave();
  }

  async function saveAndNext() {
    const saved = await persist();
    if (!saved) return;
    if (indexRef.current < latest.current.lines.length - 1) {
      setIndex(indexRef.current + 1);
      setFocusLine(true);
      return;
    }
    addLine();
  }

  function canReplaceModel(current: string) {
    if (modelTouched.current) return false;
    if (!current.trim()) return true;
    return current === autofill.current.model;
  }

  function applySerial(value: string, force: boolean) {
    setReport((current) => {
      const lines = current.lines.slice();
      const currentLine = lines[indexRef.current];
      if (!currentLine) return current;
      const machine = matchMachine(currentLine.customer, value, suggestionsRef.current);
      const serial = force && machine ? machine.serialNo : value;
      const next = { ...currentLine, serialNo: serial };
      const prefix = prefixOf(serial);
      const previous = prefixOf(serialAtEdit.current);
      const prefixChanged = prefix.length >= 3 && prefix.toLowerCase() !== previous.toLowerCase();
      if (prefix.length < 3) serialAtEdit.current = serial;
      const model = modelForSerial(serial, current.prefixMap, machine?.modelNo ?? "");
      if (force || canReplaceModel(currentLine.modelNo)) {
        if (machine || prefixChanged || (model && !currentLine.modelNo.trim())) {
          if (model) {
            next.modelNo = model;
            autofill.current.model = model;
          }
        } else if (!serial.trim() && !currentLine.modelNo.trim()) {
          next.modelNo = "";
          autofill.current.model = "";
        }
      }
      if (prefix.length >= 3) serialAtEdit.current = serial;
      if (machine?.location && (force || (!locationTouched.current && !currentLine.location.trim()))) {
        next.location = machine.location;
        autofill.current.location = machine.location;
      }
      if (force) {
        modelTouched.current = false;
        locationTouched.current = false;
      }
      lines[indexRef.current] = next;
      return { ...current, lines };
    });
    scheduleSave();
  }

  function onSerial(value: string) {
    applySerial(value, false);
  }

  function pickMachine(serial: string) {
    applySerial(serial, true);
  }

  function considerModel(value: string) {
    const currentLine = latest.current.lines[indexRef.current];
    if (!currentLine) return;
    const prefix = prefixOf(currentLine.serialNo);
    const model = value.trim();
    if (!model || model === "Unknown Model" || prefix.length < 3) return;
    const exists = latest.current.prefixMap.some(
      (entry) => entry.prefix.toLowerCase() === prefix.toLowerCase(),
    );
    if (!exists) setPrompt({ prefix, model });
  }

  function addPromptToMap() {
    if (!prompt) return;
    setReport((current) => ({
      ...current,
      prefixMap: [...current.prefixMap, { prefix: prompt.prefix, model: prompt.model }],
    }));
    setPrompt(null);
    scheduleSave();
  }

  function checkPrefixMap() {
    const map = latest.current.prefixMap.map((entry) => ({ ...entry }));
    const found: Conflict[] = [];
    let added = 0;
    for (const workOrder of latest.current.lines) {
      const prefix = prefixOf(workOrder.serialNo);
      const model = workOrder.modelNo.trim();
      if (prefix.length < 3 || !model || model === "Unknown Model") continue;
      const existing = map.find((entry) => entry.prefix.toLowerCase() === prefix.toLowerCase());
      if (!existing) {
        map.push({ prefix, model });
        added += 1;
      } else if (existing.model.toLowerCase() !== model.toLowerCase()) {
        if (!found.some((item) => item.prefix === existing.prefix && item.incoming === model)) {
          found.push({ prefix: existing.prefix, existing: existing.model, incoming: model });
        }
      }
    }
    setReport((current) => ({ ...current, prefixMap: map }));
    setConflicts(found);
    setAddedCount(added);
    if (added) scheduleSave();
  }

  function overwritePrefix(conflict: Conflict) {
    setReport((current) => ({
      ...current,
      prefixMap: current.prefixMap.map((entry) =>
        entry.prefix.toLowerCase() === conflict.prefix.toLowerCase()
          ? { ...entry, model: conflict.incoming }
          : entry,
      ),
    }));
    setConflicts((current) => current.filter((item) => item !== conflict));
    scheduleSave();
  }

  async function download() {
    dirty.current = true;
    const saved = await persist();
    if (!saved) return;
    const anchor = document.createElement("a");
    anchor.href = `/api/reports/${report.id}/export`;
    anchor.click();
  }

  async function removeReport() {
    const response = await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Could not delete this report.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  const locationNote = !line
    ? ""
    : sites.length === 1 && line.location === sites[0]
      ? `${sites[0]} is the only site on file for ${line.customer}.`
      : sites.length > 1
        ? `${sites.length} sites on file for ${line.customer}. Type to filter that list.`
        : line.customer.trim()
          ? "No saved site for this customer yet. Type one and it will be remembered with them."
          : "Choose a customer first. The site list stays limited to that customer.";

  const hours = line ? timeTakenHours(line.arrivalTime, line.departureTime) : null;

  const machines = line ? machinesFor(line.customer, suggestions) : [];
  const machineOptions = machines.map((machine) => ({
    value: machine.serialNo,
    label: machine.serialNo,
    description: [machine.modelNo, machine.location].filter(Boolean).join(" · "),
  }));
  const machineHint = !line?.customer.trim()
    ? "Choose a customer first. Machines stay limited to that customer."
    : machines.length
      ? `${machines.length} machines on file for ${line.customer}. Pick one, or type a new serial.`
      : "No machines on file for this customer. Type the serial. The prefix map still fills the model.";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <a href="#work-order" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-40 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
        Skip to work order
      </a>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Entry</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {month}
              {report.preparedBy ? ` · ${report.preparedBy}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {status === "saving" && "Saving…"}
              {status === "saved" && "Saved"}
              {status === "unsaved" && "Unsaved changes"}
              {status === "error" && "Not saved"}
            </span>
            <Button type="button" variant="outline" onClick={() => void download()}>
              Export workbook
            </Button>
            <MonthActions quiet />
          </div>
        </div>
        {months.length > 1 && (
          <div className="grid max-w-md gap-1.5">
            <Label htmlFor="month-switch">Month</Label>
            <select
              id="month-switch"
              className={selectClass}
              value={report.id}
              onChange={(event) => {
                const next = event.target.value;
                void (async () => {
                  if (dirty.current) await persist();
                  router.push(`/?report=${next}`);
                })();
              }}
            >
              {months.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.monthLabel} · {item.preparedBy || "No preparer"} · {item.lineCount} orders
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="report-title">Report title</Label>
            <Input
              id="report-title"
              className="h-11 text-base"
              value={report.title}
              onChange={(event) => {
                setReport((current) => ({ ...current, title: event.target.value }));
                scheduleSave();
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prepared-by">Prepared by</Label>
            <Input
              id="prepared-by"
              className="h-11 text-base"
              value={report.preparedBy}
              onChange={(event) => {
                setReport((current) => ({ ...current, preparedBy: event.target.value }));
                scheduleSave();
              }}
            />
          </div>
        </div>
        {saveError && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            {saveError}
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Work orders" className="hidden lg:block">
          <p className="mb-2 text-sm font-medium text-muted-foreground">This month</p>
          <div className="max-h-[calc(100vh-8rem)] space-y-1 overflow-auto pr-1">
            {report.lines.map((workOrder, lineIndex) => (
              <button
                key={workOrder.id}
                type="button"
                tabIndex={-1}
                onClick={() => setIndex(lineIndex)}
                className={cn(
                  "w-full rounded-md border-l-2 px-3 py-2 text-left",
                  lineIndex === index ? "border-primary bg-accent" : "border-transparent hover:bg-muted",
                )}
              >
                <span className="font-mono text-xs text-muted-foreground">{workOrder.no || "—"}</span>
                <span className="block truncate text-sm">{workOrder.customer || "Blank work order"}</span>
              </button>
            ))}
          </div>
        </nav>

        <div id="work-order" className="grid gap-4">
          {!line ? (
            <div className="rounded-xl bg-card px-4 py-8 ring-1 ring-foreground/10">
              <h2 className="text-lg font-medium">No work orders in this month</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add the first call. Customer, site, and technician names you have used before are ready to filter as you type.
              </p>
              <Button type="button" className="mt-4" onClick={addLine}>
                Add a work order
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="grid min-w-48 flex-1 gap-1.5">
                  <Label htmlFor="line-jump">Work order</Label>
                  <select
                    id="line-jump"
                    className={selectClass}
                    value={String(index)}
                    onChange={(event) => setIndex(Number(event.target.value))}
                  >
                    {report.lines.map((workOrder, lineIndex) => (
                      <option key={workOrder.id} value={lineIndex}>
                        {workOrder.no || lineIndex + 1} · {workOrder.customer || "Blank"}{" "}
                        {workOrder.wor ? `· ${workOrder.wor}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-sm text-muted-foreground">
                  {index + 1} of {report.lines.length}
                </p>
              </div>

              <Section title="Job">
                <TextField
                  id="line-no"
                  label="No."
                  value={line.no}
                  inputRef={noRef}
                  onChange={(value) => patchLine({ no: value })}
                />
                <TextField id="line-wor" label="WOR" value={line.wor} onChange={(value) => patchLine({ wor: value })} />
                <TextField
                  id="line-date"
                  label="Date"
                  type="date"
                  value={line.date}
                  onChange={(value) => patchLine({ date: value })}
                />
              </Section>

              <Section
                title="Customer and site"
                hint="The workbook calls the site Location. Type to filter. Tab keeps a new name."
              >
                <SuggestInput
                  id="line-customer"
                  label="Customer"
                  value={line.customer}
                  suggestions={suggestions.customers}
                  placeholder="Start typing a customer"
                  onFocus={() => {
                    customerAtFocus.current = line.customer;
                  }}
                  onChange={(value) => patchLine({ customer: value })}
                  onCommit={(value) => {
                    const currentLine = latest.current.lines[indexRef.current];
                    if (!currentLine) return;
                    const applied = applyCustomerChange(
                      customerAtFocus.current,
                      value,
                      currentLine.location,
                      suggestionsRef.current,
                    );
                    customerAtFocus.current = applied.customer;
                    if (
                      applied.customer === currentLine.customer &&
                      applied.location === currentLine.location
                    ) {
                      return;
                    }
                    setReport((current) => {
                      const lines = current.lines.slice();
                      const row = lines[indexRef.current];
                      if (!row) return current;
                      lines[indexRef.current] = {
                        ...row,
                        customer: applied.customer,
                        location: applied.location,
                      };
                      return { ...current, lines };
                    });
                    scheduleSave();
                  }}
                />
                <SuggestInput
                  id="line-location"
                  label="Location"
                  value={line.location}
                  suggestions={sites}
                  placeholder={sites.length ? "Filter this customer's sites" : "Type a site"}
                  hint={locationNote}
                  onChange={(value) => {
                    locationTouched.current = value.trim() !== "" && value !== autofill.current.location;
                    patchLine({ location: value });
                  }}
                  onCommit={(value) => {
                    const options = locationsFor(
                      latest.current.lines[indexRef.current]?.customer ?? "",
                      suggestionsRef.current,
                    );
                    const location = canonicalize(value, options);
                    if (location !== value) patchLine({ location });
                  }}
                />
              </Section>

              <Section title="Service">
                <Choice
                  id="line-service-type"
                  label="Service Type"
                  value={line.serviceType}
                  options={SERVICE_TYPES}
                  onChange={(value) => patchLine({ serviceType: value })}
                />
                <Choice
                  id="line-sla-type"
                  label="SLA Type"
                  value={line.slaType}
                  options={SLA_TYPES}
                  onChange={(value) => patchLine({ slaType: value })}
                />
              </Section>

              <Section
                title="Machine"
                hint="Serial comes first. Pick a machine this customer already has, or type a new one. The prefix map fills Model No. when you have not typed a model yourself."
              >
                <SuggestInput
                  id="line-serial"
                  label="Serial No."
                  value={line.serialNo}
                  suggestions={machineOptions}
                  limit={40}
                  placeholder={machines.length ? "Filter serial or model" : "Serial number"}
                  hint={machineHint}
                  onFocus={() => {
                    serialAtEdit.current = line.serialNo;
                  }}
                  onChange={onSerial}
                  onCommit={onSerial}
                  onPick={pickMachine}
                />
                <TextField
                  id="line-model"
                  label="Model No."
                  value={line.modelNo}
                  className={line.modelNo === "Unknown Model" ? "border-destructive" : undefined}
                  onChange={(value) => {
                    modelTouched.current = value.trim() !== "" && value !== autofill.current.model;
                    patchLine({ modelNo: value });
                  }}
                  onBlur={(value) => considerModel(value)}
                />
                <TextField
                  id="line-copycount"
                  label="Copycount"
                  value={line.copycount}
                  onChange={(value) => patchLine({ copycount: value })}
                />
              </Section>

              {prompt && (
                <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm">
                    Add prefix <span className="font-mono">{prompt.prefix}</span> for{" "}
                    <span className="font-medium">{prompt.model}</span> to this report&apos;s prefix map?
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={addPromptToMap}>
                      Add prefix
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setPrompt(null)}>
                      Not now
                    </Button>
                  </div>
                </div>
              )}

              <Section title="Crew" hint="Both columns share the technician list from saved rows.">
                <SuggestInput
                  id="line-tech"
                  label="Technician Assigned"
                  value={line.technician}
                  suggestions={suggestions.techs}
                  placeholder="Start typing a technician"
                  onChange={(value) => patchLine({ technician: value })}
                  onCommit={(value) => {
                    const technician = canonicalize(value, suggestionsRef.current.techs);
                    if (technician !== value) patchLine({ technician });
                  }}
                />
                <SuggestInput
                  id="line-secondary-tech"
                  label="Secondary Tech"
                  value={line.secondaryTech}
                  suggestions={suggestions.techs}
                  placeholder="Optional"
                  onChange={(value) => patchLine({ secondaryTech: value })}
                  onCommit={(value) => {
                    const secondaryTech = canonicalize(value, suggestionsRef.current.techs);
                    if (secondaryTech !== value) patchLine({ secondaryTech });
                  }}
                />
              </Section>

              <Section title="Time on site">
                <TextField
                  id="line-arrival"
                  label="Arrival Time"
                  type="time"
                  value={line.arrivalTime}
                  onChange={(value) => patchLine({ arrivalTime: value })}
                />
                <TextField
                  id="line-departure"
                  label="Departure Time"
                  type="time"
                  value={line.departureTime}
                  onChange={(value) => patchLine({ departureTime: value })}
                />
                <div className="grid gap-1.5">
                  <Label htmlFor="line-time-taken">Time Taken</Label>
                  <Input
                    id="line-time-taken"
                    readOnly
                    className="h-11 bg-muted/60 text-base"
                    value={hours == null ? "" : formatHours(hours)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Hours between arrival and departure. If departure is earlier, it wraps past midnight.
                  </p>
                </div>
              </Section>

              <Section title="Parts">
                <Choice
                  id="line-parts-required"
                  label="Parts Required"
                  value={line.partsRequired}
                  options={PARTS_REQUIRED}
                  onChange={(value) => patchLine({ partsRequired: value })}
                />
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="line-part-no">Part No.</Label>
                  <Textarea
                    id="line-part-no"
                    value={line.partNo}
                    rows={2}
                    spellCheck={false}
                    placeholder="One part number per line"
                    onChange={(event) => patchLine({ partNo: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    The sheet header is “Part  No.” Multiple parts stay on separate lines.
                  </p>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="line-description">Description</Label>
                  <Textarea
                    id="line-description"
                    value={line.description}
                    rows={2}
                    onChange={(event) => patchLine({ description: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="line-qty">QTY</Label>
                  <Textarea
                    id="line-qty"
                    value={line.qty}
                    rows={2}
                    onChange={(event) => patchLine({ qty: event.target.value })}
                  />
                </div>
                <TextField id="line-iro" label="IRO" value={line.iro} onChange={(value) => patchLine({ iro: value })} />
              </Section>

              <Section title="Billing">
                <Choice
                  id="line-payment"
                  label="Payment Method"
                  value={line.paymentMethod}
                  options={PAYMENT_METHODS}
                  onChange={(value) => patchLine({ paymentMethod: value })}
                />
                <TextField
                  id="line-revenue"
                  label="Revenue ($)"
                  inputMode="decimal"
                  value={line.revenue}
                  onChange={(value) => patchLine({ revenue: value })}
                />
                <Choice
                  id="line-status"
                  label="Job Status"
                  value={line.jobStatus}
                  options={JOB_STATUSES}
                  onChange={(value) => patchLine({ jobStatus: value })}
                />
                <Choice
                  id="line-ftf"
                  label="FTF"
                  value={line.ftf}
                  options={FTF_VALUES}
                  onChange={(value) => patchLine({ ftf: value })}
                />
              </Section>

              <Section title="Notes">
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="line-comments">Comments</Label>
                  <Textarea
                    id="line-comments"
                    value={line.comments}
                    rows={3}
                    onChange={(event) => patchLine({ comments: event.target.value })}
                  />
                </div>
              </Section>

              <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
                <Button type="button" onClick={() => void saveAndNext()}>
                  Save and next
                </Button>
                <Button type="button" variant="outline" onClick={addLine}>
                  New work order
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Remove
                </Button>
                <p className="text-sm text-muted-foreground">
                  {index + 1} of {report.lines.length}
                </p>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Tab moves through the fields. Enter picks a highlighted name or machine. Ctrl+S saves. Ctrl+Enter
                saves and opens the next work order. Export uses {fileMonthStamp(report.lines)}.
              </p>
            </>
          )}

          <details className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <summary className="cursor-pointer text-sm font-medium">
              Prefix map ({report.prefixMap.length})
            </summary>
            <div className="mt-3 grid gap-3">
              <p className="text-sm text-muted-foreground">
                Column A is the first three characters of a serial. Column B is the model the Master sheet macro writes.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={checkPrefixMap}>
                  Update from work orders
                </Button>
              </div>
              {addedCount > 0 && (
                <p className="text-sm">Added {addedCount} new prefix{addedCount === 1 ? "" : "es"}.</p>
              )}
              {conflicts.length > 0 && (
                <ul className="grid gap-2">
                  {conflicts.map((conflict) => (
                    <li key={`${conflict.prefix}-${conflict.incoming}`} className="rounded-lg border px-3 py-2 text-sm">
                      Prefix <span className="font-mono">{conflict.prefix}</span> is mapped to {conflict.existing}. A
                      work order says {conflict.incoming}.
                      <div className="mt-2 flex gap-2">
                        <Button type="button" size="sm" onClick={() => overwritePrefix(conflict)}>
                          Overwrite
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setConflicts((current) => current.filter((item) => item !== conflict))}
                        >
                          Keep {conflict.existing}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <PrefixAdder
                onAdd={(entry: PrefixEntry) => {
                  setReport((current) => ({ ...current, prefixMap: [...current.prefixMap, entry] }));
                  scheduleSave();
                }}
              />
              <ul className="max-h-48 overflow-auto text-sm">
                {report.prefixMap.map((entry) => (
                  <li key={`${entry.prefix}-${entry.model}`} className="grid grid-cols-[5rem_1fr] gap-2 border-b py-1">
                    <span className="font-mono">{entry.prefix}</span>
                    <span>{entry.model}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <Button type="button" variant="ghost" className="justify-self-start text-destructive" onClick={() => void removeReport()}>
            Delete this report
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this work order?</DialogTitle>
            <DialogDescription>
              It is dropped from this month. Customers, sites, and technicians you already saved stay in the lists.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" onClick={removeLine}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card px-4 py-5 sm:px-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-sm leading-6 text-muted-foreground">{hint}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  onFocus,
  type = "text",
  inputMode,
  spellCheck,
  className,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
  onFocus?: () => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  spellCheck?: boolean;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={inputRef}
        id={id}
        type={type}
        inputMode={inputMode}
        spellCheck={spellCheck}
        className={cn("h-11 text-base", className)}
        value={value}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur ? (event) => onBlur(event.target.value) : undefined}
      />
    </div>
  );
}

function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const extra = value && !options.includes(value) ? [value] : [];
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose</option>
        {[...extra, ...options].map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function PrefixAdder({ onAdd }: { onAdd: (entry: PrefixEntry) => void }) {
  const [prefix, setPrefix] = useState("");
  const [model, setModel] = useState("");
  return (
    <form
      className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!prefix.trim() || !model.trim()) return;
        onAdd({ prefix: prefix.trim().slice(0, 3), model: model.trim() });
        setPrefix("");
        setModel("");
      }}
    >
      <Input
        aria-label="New prefix"
        value={prefix}
        maxLength={3}
        placeholder="Prefix"
        onChange={(event) => setPrefix(event.target.value)}
      />
      <Input
        aria-label="Model for prefix"
        value={model}
        placeholder="Model"
        onChange={(event) => setModel(event.target.value)}
      />
      <Button type="submit" variant="outline">
        Add
      </Button>
    </form>
  );
}
