"use client";
import { useEffect, useState } from "react";
import { CustomerFormPreview } from "./customer-form-preview";
import {
  defaultFormLayout,
  formFields,
  validateFormLayout,
  FORM_WIDTH,
  FORM_HEIGHT,
  type FormLayout,
  type FieldBox,
} from "@/lib/form-layout";
import { emptyJob } from "@/lib/field-model";
import { deskApi } from "@/lib/client-api";
import { announceFormLayout } from "@/lib/use-form-layout";
import { Button } from "./ui/button";
import type { PublishedFormLayout } from "@/lib/form-layout-store";

const sample = emptyJob("layout-preview");
Object.assign(sample.line, {
  wor: "OWOR00001",
  customer: "Sample customer",
  technician: "Sample technician",
  location: "Port of Spain",
  modelNo: "Canon imageRUNNER",
  serialNo: "ABC123456",
  copycount: "125,000",
  partNo: "PART-01\nPART-02",
  description: "Feed roller\nCleaning kit",
  qty: "1\n1",
  arrivalTime: "08:30",
  departureTime: "10:15",
});
Object.assign(sample.fields, {
  clientAddress: "34 Richmond Street, Port of Spain",
  scheduledDate: "2026-10-23",
  phone: "868 555 0100",
  requesterName: "Sample requester",
  requesterEmail: "customer@example.com",
  workRequired: "Inspect and service equipment",
  workCarriedOut:
    "Inspected and cleaned the machine.\nReplaced the feed roller and tested print quality.",
  otherPerformed: "Cleaned rollers",
  otherNeeded: "Review next service",
  startedDate: "2026-10-23",
  completedDate: "2026-10-23",
  completedByName: "Sample technician",
  completedByDesignation: "Technician",
  approvedByName: "Sample customer",
  approvedByDesignation: "Office manager",
  approvedDate: "2026-10-23",
  serviceOption: "Rental",
});
const controls: [keyof FieldBox, string, number, number][] = [
  ["x", "Left position", 0, FORM_WIDTH - 20],
  ["y", "Top position", 0, FORM_HEIGHT - 16],
  ["w", "Width", 20, FORM_WIDTH],
  ["h", "Height", 16, FORM_HEIGHT],
  ["size", "Font size", 8, 40],
  ["leading", "Line spacing", 8, 80],
];
export function FormLayoutEditor() {
  const [layout, setLayout] = useState<FormLayout>(defaultFormLayout),
    [saved, setSaved] = useState<PublishedFormLayout>(),
    [selected, setSelected] = useState(formFields[0].label),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const dirty =
      !!saved && JSON.stringify(layout) !== JSON.stringify(saved.layout),
    box = layout[selected];
  async function load() {
    setBusy(true);
    setError("");
    try {
      const data = await deskApi<PublishedFormLayout>("/api/admin/form-layout");
      validateFormLayout(data.layout);
      setLayout(data.layout);
      setSaved(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function change(label: string, value: FieldBox) {
    setLayout((current) => ({ ...current, [label]: value }));
    setMessage("");
  }
  function numeric(key: keyof FieldBox, value: number) {
    if (!Number.isFinite(value)) return;
    const next = { ...box, [key]: value };
    next.x = Math.max(0, Math.min(FORM_WIDTH - 20, next.x));
    next.y = Math.max(0, Math.min(FORM_HEIGHT - 16, next.y));
    next.w = Math.max(20, Math.min(FORM_WIDTH - next.x, next.w));
    next.h = Math.max(16, Math.min(FORM_HEIGHT - next.y, next.h));
    next.size = Math.max(8, Math.min(40, next.size));
    next.leading = Math.max(next.size, Math.min(80, next.leading));
    change(selected, next);
  }
  async function publish() {
    if (!saved) return;
    setBusy(true);
    setError("");
    try {
      validateFormLayout(layout);
      const data = await deskApi<PublishedFormLayout>(
        "/api/admin/form-layout",
        { layout, revision: saved.revision },
      );
      setSaved(data);
      setLayout(data.layout);
      announceFormLayout(data.layout);
      setMessage(
        "Published site-wide. Open forms update within 30 seconds; new PDF exports use these positions.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="grid gap-4 rounded-xl border bg-card p-4 sm:p-6"
      aria-label="Customer form layout editor"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Customer form layout</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Edit the text boxes on the actual viewable form. Click a box, drag
            to move it, or drag its blue corner to resize. Publish applies the
            layout to every device and PDF export.
          </p>
        </div>
        <Button disabled={!dirty || busy} onClick={() => void publish()}>
          {busy ? "Working…" : "Publish site-wide"}
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
      {!saved ? (
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          Reload layout
        </Button>
      ) : (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <fieldset
              disabled={busy}
              className="grid gap-3 rounded-lg border p-3 lg:sticky lg:top-4"
            >
              <legend className="px-1 text-sm font-semibold">
                Text box settings
              </legend>
              <label className="grid gap-1 text-sm">
                Selected text box
                <select
                  className="min-h-11 min-w-0 rounded border bg-background px-2"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {formFields.map((field) => (
                    <option key={field.label}>{field.label}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {controls.map(([key, label, min, max]) => (
                  <label key={key} className="grid gap-1 text-xs">
                    {label}
                    <input
                      aria-label={label}
                      type="number"
                      min={min}
                      max={max}
                      step="1"
                      className="min-h-11 w-full rounded border bg-background px-2 text-base"
                      value={box[key]}
                      onChange={(e) => numeric(key, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Sizes use the original 1102 × 1427 image. Font size and line
                spacing scale with the page.
              </p>
              <Button variant="outline" onClick={() => setPreview(!preview)}>
                {preview ? "Edit boxes" : "Preview without guides"}
              </Button>
              <Button
                variant="outline"
                onClick={() => change(selected, defaultFormLayout()[selected])}
              >
                Reset selected box
              </Button>
              <Button
                variant="outline"
                onClick={() => setLayout(defaultFormLayout())}
              >
                Reset all to original
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setLayout(saved.layout);
                  setMessage("");
                }}
              >
                Discard unpublished edits
              </Button>
              <Button variant="ghost" onClick={() => void load()}>
                Reload published layout
              </Button>
              <p className="text-xs text-muted-foreground">
                Revision {saved.revision} ·{" "}
                {dirty ? "Unpublished changes" : "Published layout"}
              </p>
            </fieldset>
            <CustomerFormPreview
              job={sample}
              layout={layout}
              selectedField={preview ? undefined : selected}
              onSelectField={setSelected}
              onLayoutChange={preview || busy ? undefined : change}
            />
          </div>
        </>
      )}
    </section>
  );
}
