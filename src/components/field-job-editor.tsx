"use client";
import { useState, useEffect } from "react";
import {
  PAYMENT_METHODS,
  SERVICE_TYPES,
  SLA_TYPES,
  JOB_STATUSES,
  type WorkOrder,
} from "@/lib/model";
import {
  customerSnapshot,
  type FieldJob,
  type ContactFields,
} from "@/lib/field-model";
import { SignaturePad } from "./signature-pad";
import { CustomerFormPreview } from "./customer-form-preview";
import { deskApi } from "@/lib/client-api";
import type { Part } from "@/lib/parts-model";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import type { Actor } from "@/lib/accounts";
export type TechnicianOption = { id: string; name: string; technician: string };
const control =
  "min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-base";
export function FieldJobEditor({
  job,
  onChange,
  users,
  actor,
  readOnly = false,
  onReady,
}: {
  job: FieldJob;
  onChange: (job: FieldJob) => void;
  users: TechnicianOption[];
  actor: Actor;
  readOnly?: boolean;
  onReady: () => void;
}) {
  const [catalog, setCatalog] = useState<Part[]>([]);
  useEffect(() => {
    void deskApi<{ parts: Part[] }>("/api/parts")
      .then((data) => setCatalog(data.parts))
      .catch(() => {});
  }, []);
  const [preview, setPreview] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [signing, setSigning] = useState(false),
    [error, setError] = useState("");
  function change(next: FieldJob) {
    setReviewed(false);
    const content = (value: FieldJob) =>
      JSON.stringify({ ...customerSnapshot(value), signature: null });
    const changed = content(next) !== content(job);
    onChange({
      ...next,
      signature: changed ? undefined : next.signature,
      signedHash: undefined,
    });
  }
  function line(field: keyof WorkOrder, value: string) {
    change({ ...job, line: { ...job.line, [field]: value } });
  }
  function detail(field: keyof ContactFields, value: string) {
    change({ ...job, fields: { ...job.fields, [field]: value } });
  }
  const input = (label: string, field: keyof WorkOrder, type = "text") => (
    <label className="grid gap-1.5 text-sm">
      {label}
      <Input
        type={type}
        disabled={readOnly}
        value={String(job.line[field] ?? "")}
        onChange={(e) => line(field, e.target.value)}
      />
    </label>
  );
  const contact = (
    label: string,
    field: keyof ContactFields,
    type = "text",
  ) => (
    <label className="grid gap-1.5 text-sm">
      {label}
      <Input
        type={type}
        disabled={readOnly}
        value={job.fields[field]}
        onChange={(e) => detail(field, e.target.value)}
      />
    </label>
  );
  const note = (label: string, field: keyof ContactFields) => (
    <label className="grid gap-1.5 text-sm">
      {label}
      <textarea
        className={control + " min-h-28"}
        disabled={readOnly}
        value={job.fields[field]}
        onChange={(e) => detail(field, e.target.value)}
        maxLength={20000}
      />
    </label>
  );
  function select(
    label: string,
    field: keyof WorkOrder,
    options: readonly string[],
  ) {
    return (
      <label className="grid gap-1.5 text-sm">
        {label}
        <select
          className={control}
          disabled={readOnly}
          value={String(job.line[field] ?? "")}
          onChange={(e) => line(field, e.target.value)}
        >
          <option value="">Choose</option>
          {options.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
    );
  }
  function assignments(ids: string[]) {
    const names = ids.map(
      (id) => users.find((user) => user.id === id)?.technician || "",
    );
    change({
      ...job,
      assignedIds: ids,
      line: {
        ...job.line,
        technician: names[0] || "",
        secondaryTech: names[1] || "",
        additionalTechs: names.slice(2),
      },
    });
  }
  async function ready() {
    setError("");
    if (!reviewed || !job.signature) {
      setError("Review the form and capture the customer's signature first.");
      return;
    }
    setSigning(true);
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(customerSnapshot(job))),
      );
      onChange({
        ...job,
        signedHash: [...new Uint8Array(digest)]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join(""),
      });
      onReady();
    } catch {
      setError("Use HTTPS or localhost to prepare a signed upload.");
    } finally {
      setSigning(false);
    }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.8fr)]">
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {readOnly ? "Work order" : "Work order entry"}
          </h2>
          <button
            className="text-sm underline xl:hidden"
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Hide" : "Show"} customer form
          </button>
        </div>
        <section className="grid gap-4 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Client and request</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {input("Request number", "wor")}
            {input("Work date", "date", "date")}
            {input("Client name", "customer")}
            {input("Site / location", "location")}
            {contact("Client / worksite address", "clientAddress")}
            {contact("Phone number", "phone", "tel")}
            {contact("Requester name", "requesterName")}
            {contact(
              "Requester email for customer copy",
              "requesterEmail",
              "email",
            )}
            {contact("Scheduled date", "scheduledDate", "date")}
          </div>
        </section>
        <section className="grid gap-4 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Technicians</h3>
          <p className="text-xs text-muted-foreground">
            Up to six technicians. Everyone assigned can see this job in their
            monthly history. The lead technician edits it.
          </p>
          {job.assignedIds.map((id, index) => (
            <div key={index} className="flex items-end gap-2">
              <label className="grid flex-1 gap-1 text-sm">
                {index === 0 ? "Lead technician" : `Technician ${index + 1}`}
                <select
                  className={control}
                  disabled={readOnly || (index === 0 && actor.role === "tech")}
                  value={id}
                  onChange={(e) =>
                    assignments(
                      job.assignedIds.map((value, i) =>
                        i === index ? e.target.value : value,
                      ),
                    )
                  }
                >
                  <option value="">Choose</option>
                  {users
                    .filter(
                      (user) =>
                        user.id === id || !job.assignedIds.includes(user.id),
                    )
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.technician}
                      </option>
                    ))}
                </select>
              </label>
              {index > 0 && !readOnly && (
                <Button
                  variant="outline"
                  onClick={() =>
                    assignments(job.assignedIds.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {!readOnly && job.assignedIds.length < 6 && (
            <Button
              variant="outline"
              onClick={() => assignments([...job.assignedIds, ""])}
            >
              Add technician
            </Button>
          )}
        </section>
        <section className="grid gap-4 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Work and equipment</h3>
          {note("Description of work required", "workRequired")}
          {note("Details of work carried out", "workCarriedOut")}
          <div className="grid gap-4 sm:grid-cols-2">
            {input("Model", "modelNo")}
            {input("Serial number", "serialNo")}
            {input("Copy count", "copycount")}
            {select("Service type", "serviceType", SERVICE_TYPES)}
            {select("SLA", "slaType", SLA_TYPES)}
            {select("Job status", "jobStatus", JOB_STATUSES)}
          </div>
          {note("Other work performed", "otherPerformed")}
          {note("Other work needed", "otherNeeded")}
        </section>
        <section className="grid gap-4 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Parts and billing</h3>
          <p className="text-xs text-muted-foreground">
            For multiple parts, use one line per part, description and quantity.
            New part quantities start at one.
          </p>
          <label className="grid gap-1 text-sm">
            Parts required
            <select
              className={control}
              value={job.line.partsRequired}
              disabled={readOnly}
              onChange={(e) => line("partsRequired", e.target.value)}
            >
              <option>No</option>
              <option>Yes</option>
            </select>
          </label>
          {job.line.partsRequired === "Yes" && (
            <div className="grid gap-3">
              <datalist id="field-part-catalog">
                {catalog.map((part) => (
                  <option key={part.partNo} value={part.partNo}>
                    {part.description}
                  </option>
                ))}
              </datalist>
              {job.line.partNo.split(/\r?\n/).map((number, index) => {
                const descriptions = job.line.description.split(/\r?\n/),
                  quantities = job.line.qty.split(/\r?\n/);
                function updatePart(
                  field: "partNo" | "description" | "qty",
                  value: string,
                ) {
                  const numbers = job.line.partNo.split(/\r?\n/),
                    desc = [...descriptions],
                    qty = [...quantities];
                  while (desc.length < numbers.length) desc.push("");
                  while (qty.length < numbers.length) qty.push("");
                  if (field === "partNo") {
                    numbers[index] = value;
                    const found = catalog.find(
                      (part) =>
                        part.partNo.toLowerCase() ===
                        value.trim().toLowerCase(),
                    );
                    if (found) desc[index] = found.description;
                    if (!qty[index]) qty[index] = "1";
                  }
                  if (field === "description") desc[index] = value;
                  if (field === "qty") qty[index] = value;
                  change({
                    ...job,
                    line: {
                      ...job.line,
                      partNo: numbers.join("\n"),
                      description: desc.join("\n"),
                      qty: qty.join("\n"),
                    },
                  });
                }
                return (
                  <div
                    key={index}
                    className="grid gap-2 sm:grid-cols-[1fr_2fr_90px]"
                  >
                    <label className="grid gap-1 text-sm">
                      Part number
                      <Input
                        list="field-part-catalog"
                        value={number}
                        disabled={readOnly}
                        onChange={(e) => updatePart("partNo", e.target.value)}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Description
                      <Input
                        value={descriptions[index] || ""}
                        disabled={readOnly}
                        onChange={(e) =>
                          updatePart("description", e.target.value)
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Quantity
                      <Input
                        type="number"
                        min="0"
                        value={quantities[index] || ""}
                        disabled={readOnly}
                        onChange={(e) => updatePart("qty", e.target.value)}
                      />
                    </label>
                  </div>
                );
              })}
              {!readOnly && (
                <Button
                  variant="outline"
                  onClick={() =>
                    change({
                      ...job,
                      line: {
                        ...job.line,
                        partNo: job.line.partNo + "\n",
                        description: job.line.description + "\n",
                        qty: job.line.qty ? job.line.qty + "\n1" : "1\n1",
                      },
                    })
                  }
                >
                  Add part line
                </Button>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {select("Payment method", "paymentMethod", PAYMENT_METHODS)}
            {input("Recorded revenue ($)", "revenue")}
          </div>
          <p className="text-xs text-muted-foreground">
            No Charge prints above the request number and leaves the form’s
            options uncircled.
          </p>
          <label className="grid gap-1 text-sm">
            Internal notes (excluded from customer copy)
            <textarea
              className={control + " min-h-24"}
              disabled={readOnly}
              value={job.line.comments}
              onChange={(e) => line("comments", e.target.value)}
            />
          </label>
        </section>
        <section className="grid gap-4 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Completion and customer approval</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {contact("Date started", "startedDate", "date")}
            {input("Time started", "arrivalTime", "time")}
            {contact("Date completed", "completedDate", "date")}
            {input("Time completed", "departureTime", "time")}
            {contact("Completed by: printed name", "completedByName")}
            {contact("Technician designation", "completedByDesignation")}
            {contact("Approved by: customer printed name", "approvedByName")}
            {contact("Customer designation", "approvedByDesignation")}
            {contact("Approval date", "approvedDate", "date")}
          </div>
          {!readOnly && (
            <SignaturePad
              label="Completed by: optional technician signature"
              value={job.technicianSignature}
              onChange={(value) =>
                change({ ...job, technicianSignature: value })
              }
            />
          )}
          <p className="text-sm">
            I acknowledge the customer-visible work shown in this form.
          </p>
          {!readOnly && (
            <SignaturePad
              label="Approved by: customer signature"
              value={job.signature}
              onChange={(value) => change({ ...job, signature: value })}
            />
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={readOnly}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed the customer form and recipient email with the customer.
            This version is ready for upload and a customer copy.
          </label>
          {actor.role === "admin" && (
            <label className="grid gap-1 text-sm">
              Reason for amendment
              <Input
                value={job.amendmentReason || ""}
                onChange={(e) =>
                  change({ ...job, amendmentReason: e.target.value })
                }
              />
            </label>
          )}
          {!readOnly && (
            <Button
              onClick={() => void ready()}
              disabled={signing || !reviewed}
            >
              {signing ? "Preparing…" : "Mark signed version ready for upload"}
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </section>
      </div>
      <aside
        className={`${preview ? "block" : "hidden"} self-start xl:sticky xl:top-4 xl:block`}
      >
        <CustomerFormPreview job={job} />
      </aside>
    </div>
  );
}
