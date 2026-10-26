"use client";
import { useRef, useState, useEffect } from "react";
import {
  PAYMENT_METHODS,
  SERVICE_TYPES,
  SLA_TYPES,
  JOB_STATUSES,
  canonicalize,
  locationsFor,
  type WorkOrder,
} from "@/lib/model";
import {
  EMPTY_FIELD_SUGGESTIONS,
  commitFieldCustomer,
  commitFieldSerial,
  contactsFor,
  emptyFieldTouch,
  machineHint,
  serialOptions,
  siteHint,
  type FieldSuggestions,
} from "@/lib/field-suggestion-model";
import {
  canonicalSnapshot,
  needsAmendmentReason,
  withLeadName,
  type FieldJob,
  type ContactFields,
} from "@/lib/field-model";
import { SignaturePad } from "./signature-pad";
import {
  CustomerFormPreview,
  type FieldHistoryHandlers,
} from "./customer-form-preview";
import { SuggestInput } from "./suggest-input";
import { ClockTimeInput } from "./clock-time-input";
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
  suggestions = EMPTY_FIELD_SUGGESTIONS,
}: {
  job: FieldJob;
  onChange: (job: FieldJob) => void;
  users: TechnicianOption[];
  actor: Actor;
  readOnly?: boolean;
  onReady: () => void;
  suggestions?: FieldSuggestions;
}) {
  const [catalog, setCatalog] = useState<Part[]>([]);
  useEffect(() => {
    void deskApi<{ parts: Part[] }>("/api/parts")
      .then((data) => setCatalog(data.parts))
      .catch(() => {});
  }, []);
  const [reviewed, setReviewed] = useState(false),
    [signing, setSigning] = useState(false),
    [error, setError] = useState("");
  const jobRef = useRef(job);
  const touch = useRef(emptyFieldTouch());
  jobRef.current = job;
  useEffect(() => setReviewed(false), [job.line.wor]);
  function change(next: FieldJob) {
    const baseline = jobRef.current;
    if (!next.line.technician.trim() && next.fields.completedByName.trim())
      next = {
        ...next,
        line: { ...next.line, technician: next.fields.completedByName },
      };
    setReviewed(false);
    const content = (value: FieldJob) =>
      JSON.stringify({ ...canonicalSnapshot(value), signature: null });
    const changed = content(next) !== content(baseline);
    const saved = {
      ...next,
      signature: changed ? undefined : next.signature,
      signedHash: undefined,
    };
    jobRef.current = saved;
    onChange(saved);
  }
  function applyHistory(
    result: ReturnType<typeof commitFieldCustomer>,
  ) {
    touch.current = result.touch;
    if (result.job !== jobRef.current) change(result.job);
  }
  const history: FieldHistoryHandlers = {
    focusCustomer: () => {
      touch.current.customerAtFocus = jobRef.current.line.customer;
    },
    changeCustomer: (value) => line("customer", value),
    commitCustomer: (value) => {
      const current = jobRef.current;
      applyHistory(
        commitFieldCustomer(
          current,
          touch.current.customerAtFocus,
          value,
          suggestions,
          touch.current,
        ),
      );
    },
    changeSerial: (value) => {
      applyHistory(
        commitFieldSerial(
          jobRef.current,
          value,
          suggestions,
          touch.current,
          false,
        ),
      );
    },
    commitSerial: (value) => {
      applyHistory(
        commitFieldSerial(
          jobRef.current,
          value,
          suggestions,
          touch.current,
          false,
        ),
      );
    },
    pickSerial: (value) => {
      applyHistory(
        commitFieldSerial(
          jobRef.current,
          value,
          suggestions,
          touch.current,
          true,
        ),
      );
    },
    changeModel: (value) => {
      touch.current.modelTouched =
        value.trim() !== "" && value !== touch.current.autofillModel;
      line("modelNo", value);
    },
  };
  function line(field: keyof WorkOrder, value: string) {
    if (field === "wor") return;
    const current = jobRef.current;
    if (String(current.line[field] ?? "") === value) return;
    const next = { ...current, line: { ...current.line, [field]: value } };
    if (
      field === "paymentMethod" ||
      field === "slaType" ||
      field === "serviceType" ||
      field === "revenue"
    )
      next.fields = { ...current.fields, serviceOption: undefined };
    change(next);
  }
  function detail(field: keyof ContactFields, value: string) {
    const current = jobRef.current;
    if (field === "completedByName") {
      if (
        current.fields.completedByName === value &&
        current.line.technician === value
      )
        return;
      change(withLeadName(current, value));
      return;
    }
    if (current.fields[field] === value) return;
    change({ ...current, fields: { ...current.fields, [field]: value } });
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
        technician: job.fields.completedByName.trim() || names[0] || "",
        secondaryTech: names[1] || "",
        additionalTechs: names.slice(2),
      },
    });
  }
  async function ready() {
    setError("");
    if (!job.line.wor) {
      setError(
        "Connect and let the draft sync before signing, so its request number is included.",
      );
      return;
    }
    if (
      needsAmendmentReason(job) &&
      !job.amendmentReason?.trim()
    ) {
      setError("Describe the reason for this amendment.");
      return;
    }
    if (!reviewed || !job.signature) {
      setError("Review the form and capture the customer's signature first.");
      return;
    }
    setSigning(true);
    const signingJob =
      !job.line.technician.trim() && job.fields.completedByName.trim()
        ? withLeadName(job, job.fields.completedByName)
        : job;
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(canonicalSnapshot(signingJob))),
      );
      onChange({
        ...signingJob,
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
    <div className="grid gap-5">
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {readOnly ? "Work order" : "Work order entry"}
            </h2>
            <p
              id="field-work-order-number"
              className="mt-1 font-mono text-sm font-semibold text-red-700"
            >
              {job.line.wor || "Pending"}
            </p>
          </div>
        </div>
        <CustomerFormPreview
          job={job}
          onChange={readOnly ? undefined : change}
          suggestions={suggestions}
          history={readOnly ? undefined : history}
          toolbarClassName="top-[4.25rem]"
        />
        <details className="rounded-xl border bg-card p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Job settings, crew, parts & quick-entry fields
          </summary>
          <div className="mt-4 grid gap-4">
            <section className="grid gap-4 rounded-xl border bg-card p-4">
              <h3 className="font-semibold">Client and request</h3>
              <p className="text-xs text-muted-foreground">
                Type to filter saved customers, sites and machines. Choosing a
                customer fills the site when one site is on file. Address,
                phone and requester stay suggestions until you pick one.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  Work order number
                  <Input
                    id="field-wor"
                    readOnly
                    aria-readonly="true"
                    value={job.line.wor}
                    placeholder="Pending — assigned when this draft syncs"
                    className="bg-muted"
                  />
                  <span className="text-xs text-muted-foreground">
                    {job.line.wor
                      ? "Assigned by the desk. This number cannot be edited."
                      : "Pending until this draft syncs."}
                  </span>
                </label>
                {input("Work date", "date", "date")}
                <SuggestInput
                  id="field-customer"
                  label="Client name"
                  value={job.line.customer}
                  suggestions={suggestions.customers}
                  disabled={readOnly}
                  placeholder="Start typing a customer"
                  onFocus={history.focusCustomer}
                  onChange={history.changeCustomer}
                  onCommit={history.commitCustomer}
                  onPick={history.commitCustomer}
                />
                <SuggestInput
                  id="field-location"
                  label="Site / location"
                  value={job.line.location}
                  suggestions={locationsFor(job.line.customer, suggestions)}
                  disabled={readOnly}
                  placeholder={
                    locationsFor(job.line.customer, suggestions).length
                      ? "Filter this customer's sites"
                      : "Type a site"
                  }
                  hint={siteHint(
                    job.line.customer,
                    job.line.location,
                    suggestions,
                  )}
                  onChange={(value) => {
                    touch.current.locationTouched =
                      value.trim() !== "" &&
                      value !== touch.current.autofillLocation;
                    line("location", value);
                  }}
                  onCommit={(value) => {
                    const location = canonicalize(
                      value,
                      locationsFor(jobRef.current.line.customer, suggestions),
                    );
                    if (location !== jobRef.current.line.location)
                      line("location", location);
                  }}
                />
                <SuggestInput
                  id="field-address"
                  label="Client / worksite address"
                  value={job.fields.clientAddress}
                  suggestions={
                    contactsFor(job.line.customer, suggestions).addresses
                  }
                  disabled={readOnly}
                  onChange={(value) => detail("clientAddress", value)}
                  onCommit={(value) => detail("clientAddress", value)}
                />
                <SuggestInput
                  id="field-phone"
                  label="Phone number"
                  type="tel"
                  value={job.fields.phone}
                  suggestions={contactsFor(job.line.customer, suggestions).phones}
                  disabled={readOnly}
                  onChange={(value) => detail("phone", value)}
                  onCommit={(value) => detail("phone", value)}
                />
                <SuggestInput
                  id="field-requester"
                  label="Requester name"
                  value={job.fields.requesterName}
                  suggestions={
                    contactsFor(job.line.customer, suggestions).requesters
                  }
                  disabled={readOnly}
                  onChange={(value) => detail("requesterName", value)}
                  onCommit={(value) => detail("requesterName", value)}
                />
                <SuggestInput
                  id="field-email"
                  label="Requester email for customer copy"
                  type="email"
                  value={job.fields.requesterEmail}
                  suggestions={contactsFor(job.line.customer, suggestions).emails}
                  disabled={readOnly}
                  onChange={(value) => detail("requesterEmail", value)}
                  onCommit={(value) => detail("requesterEmail", value)}
                />
                {contact("Scheduled date", "scheduledDate", "date")}
              </div>
            </section>
            <section className="grid gap-4 rounded-xl border bg-card p-4">
              <h3 className="font-semibold">Technicians</h3>
              <p className="text-xs text-muted-foreground">
                Up to six technicians. Everyone assigned can see this job in
                their monthly history. The lead technician edits it. Tech name
                on the form follows the completed-by printed name, and either
                field can be edited.
              </p>
              {job.assignedIds.map((id, index) => (
                <div key={index} className="flex items-end gap-2">
                  <label className="grid flex-1 gap-1 text-sm">
                    {index === 0
                      ? "Lead technician"
                      : `Technician ${index + 1}`}
                    <select
                      className={control}
                      disabled={
                        readOnly || (index === 0 && actor.role === "tech")
                      }
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
                            user.id === id ||
                            !job.assignedIds.includes(user.id),
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
                        assignments(
                          job.assignedIds.filter((_, i) => i !== index),
                        )
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
                <label className="grid gap-1.5 text-sm">
                  Model
                  <Input
                    disabled={readOnly}
                    value={job.line.modelNo}
                    onChange={(event) => history.changeModel(event.target.value)}
                  />
                </label>
                <SuggestInput
                  id="field-serial"
                  label="Serial number"
                  value={job.line.serialNo}
                  suggestions={serialOptions(job.line.customer, suggestions)}
                  limit={40}
                  disabled={readOnly}
                  placeholder={
                    serialOptions(job.line.customer, suggestions).length
                      ? "Filter serial or model"
                      : "Serial number"
                  }
                  hint={machineHint(
                    job.line.customer,
                    serialOptions(job.line.customer, suggestions).length,
                  )}
                  onFocus={() => {
                    touch.current.serialAtEdit = jobRef.current.line.serialNo;
                  }}
                  onChange={history.changeSerial}
                  onCommit={history.commitSerial}
                  onPick={history.pickSerial}
                />
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
                For multiple parts, use one line per part, description and
                quantity. New part quantities start at one.
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
                            onChange={(e) =>
                              updatePart("partNo", e.target.value)
                            }
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
                No Charge prints above the request number. Tap a service option
                on the form to circle it; only one option can be selected.
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
          </div>
        </details>
        <section className="grid gap-4 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">Completion and customer approval</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {contact("Date started", "startedDate", "date")}
            <ClockTimeInput
              id="field-arrival"
              label="Time started"
              disabled={readOnly}
              value={job.line.arrivalTime}
              onChange={(value) => line("arrivalTime", value)}
            />
            {contact("Date completed", "completedDate", "date")}
            <ClockTimeInput
              id="field-departure"
              label="Time completed"
              disabled={readOnly}
              value={job.line.departureTime}
              onChange={(value) => line("departureTime", value)}
            />
            {contact("Completed by: printed name", "completedByName")}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Tech name on the form, the saved work order, the PDF and the
              workbook use this printed name. Change either field and the other
              follows.
            </p>
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
          {actor.role === "admin" && needsAmendmentReason(job) && (
            <label className="grid gap-1 text-sm">
              Reason for amendment
              <Input
                required
                aria-required="true"
                maxLength={1000}
                value={job.amendmentReason || ""}
                onChange={(e) =>
                  change({ ...job, amendmentReason: e.target.value })
                }
              />
              <span className="text-xs text-muted-foreground">
                Required before this submitted work order can be saved. The
                reason is kept with your name and the time in the admin history.
              </span>
            </label>
          )}
          {!readOnly && (
            <Button
              onClick={() => void ready()}
              disabled={
                signing ||
                !reviewed ||
                (needsAmendmentReason(job) && !job.amendmentReason?.trim())
              }
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
    </div>
  );
}
