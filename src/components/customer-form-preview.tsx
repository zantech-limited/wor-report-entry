"use client";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useFormLayout } from "@/lib/use-form-layout";
import {
  FORM_OPTIONS,
  SIGNATURE_MARKS,
  withLeadName,
  type FieldJob,
  type Signature,
  type ContactFields,
  type FormOption,
} from "@/lib/field-model";
import type { WorkOrder } from "@/lib/model";
import {
  contactsFor,
  machineHint,
  serialOptions,
  type FieldSuggestions,
} from "@/lib/field-suggestion-model";
import { SuggestInput } from "./suggest-input";
import { ClockTimeInput } from "./clock-time-input";
import {
  fieldsForLayout,
  formValue,
  formChoices,
  choiceSelected,
  selectServiceOption,
  type FormField,
  type FormLayout,
  type FieldBox,
  FORM_WIDTH,
  FORM_HEIGHT,
} from "@/lib/form-layout";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { SignaturePad } from "./signature-pad";
export function SignatureImage({ value }: { value?: Signature }) {
  return value ? (
    <svg
      viewBox="0 0 600 160"
      className="h-full w-full"
      aria-label="Captured signature"
    >
      {value.strokes.map((stroke, i) => (
        <polyline
          key={i}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          points={stroke.map(([x, y]) => `${x * 600},${y * 160}`).join(" ")}
        />
      ))}
    </svg>
  ) : null;
}
export type FieldHistoryHandlers = {
  focusCustomer: () => void;
  changeCustomer: (value: string) => void;
  commitCustomer: (value: string) => void;
  changeSerial: (value: string) => void;
  commitSerial: (value: string) => void;
  pickSerial: (value: string) => void;
  changeModel: (value: string) => void;
};
const position = (
  x: number,
  y: number,
  w: number,
  h: number,
): CSSProperties => ({
  position: "absolute",
  left: `${(x / FORM_WIDTH) * 100}%`,
  top: `${(y / FORM_HEIGHT) * 100}%`,
  width: `${(w / FORM_WIDTH) * 100}%`,
  height: `${(h / FORM_HEIGHT) * 100}%`,
});
export function CustomerFormPreview({
  job,
  onChange,
  layout,
  selectedField,
  onSelectField,
  onLayoutChange,
  toolbarClassName = "top-0",
  suggestions,
  history,
}: {
  job: FieldJob;
  onChange?: (job: FieldJob) => void;
  layout?: FormLayout;
  selectedField?: string;
  onSelectField?: (label: string) => void;
  onLayoutChange?: (label: string, box: FieldBox) => void;
  toolbarClassName?: string;
  suggestions?: FieldSuggestions;
  history?: FieldHistoryHandlers;
}) {
  const publishedLayout = useFormLayout(!layout);
  const fields = fieldsForLayout(layout || publishedLayout);
  const drag = useRef<
    | {
        label: string;
        x: number;
        y: number;
        scale: number;
        box: FieldBox;
        resize: boolean;
      }
    | undefined
  >(undefined);
  function beginDrag(event: PointerEvent<HTMLButtonElement>, field: FormField) {
    if (!onLayoutChange || !layout) return;
    onSelectField?.(field.label);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      label: field.label,
      x: event.clientX,
      y: event.clientY,
      scale:
        event.currentTarget.parentElement!.getBoundingClientRect().width /
        FORM_WIDTH,
      box: layout[field.label],
      resize: (event.target as HTMLElement).dataset.resize === "true",
    };
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || !onLayoutChange) return;
    const dx = Math.round((event.clientX - start.x) / start.scale),
      dy = Math.round((event.clientY - start.y) / start.scale),
      box = { ...start.box };
    if (start.resize) {
      box.w = Math.max(20, Math.min(FORM_WIDTH - box.x, box.w + dx));
      box.h = Math.max(16, Math.min(FORM_HEIGHT - box.y, box.h + dy));
    } else {
      box.x = Math.max(0, Math.min(FORM_WIDTH - box.w, box.x + dx));
      box.y = Math.max(0, Math.min(FORM_HEIGHT - box.h, box.y + dy));
    }
    onLayoutChange(start.label, box);
  }
  const [zoom, setZoom] = useState(false),
    [active, setActive] = useState<FormField>(),
    [sign, setSign] = useState<"signature" | "technicianSignature">();
  function update(field: FormField, value: string) {
    if (field.source === "crew") {
      const lead = value.split(",")[0]?.trim() ?? "";
      onChange?.(withLeadName(job, lead));
      return;
    }
    if (field.key === "completedByName") {
      onChange?.(withLeadName(job, value));
      return;
    }
    if (field.source === "fields")
      onChange?.({
        ...job,
        fields: { ...job.fields, [field.key as keyof ContactFields]: value },
      });
    if (field.source === "line")
      onChange?.({
        ...job,
        line: { ...job.line, [field.key as keyof WorkOrder]: value },
      });
  }
  return (
    <section className="min-w-0">
      <div className={`sticky ${toolbarClassName} z-20 flex items-center justify-between gap-3 rounded-t-xl border bg-background/95 px-4 py-3 backdrop-blur`}>
        <div>
          <h2 className="font-semibold">Customer work order</h2>
          <p className="text-xs text-muted-foreground">
            {onLayoutChange
              ? "Drag a box to move it; drag its corner to resize"
              : onChange
                ? "Tap a field to fill the original form"
                : "Customer copy"}
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-lg border px-4 text-sm"
          aria-pressed={zoom}
          onClick={() => setZoom(!zoom)}
        >
          {zoom ? "Fit page" : "Zoom in"}
        </button>
      </div>
      <div className="overflow-x-auto rounded-b-xl border bg-slate-100 p-2 sm:p-4">
        <article
          aria-label="Customer work order form"
          className="relative mx-auto bg-white text-slate-950 shadow-md"
          style={{
            width: zoom ? 1102 : "100%",
            maxWidth: zoom ? undefined : 1102,
            aspectRatio: `${FORM_WIDTH}/${FORM_HEIGHT}`,
            containerType: "inline-size",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/work-order-template.png"
            alt="Zantech Work Order Request original form"
            width={1102}
            height={1427}
            className="absolute inset-0 h-full w-full"
            draggable={false}
          />
          <div style={{ ...position(901, 86, 130, 43), background: "white" }} />
          {fields.map((field, index) => {
            const value = formValue(job, field),
              editable =
                onLayoutChange ||
                (onChange &&
                  field.source !== "notice" &&
                  field.key !== "wor");
            const style = {
              ...position(field.x, field.y, field.w, field.h),
              fontSize: `${(field.size || 16) / 11.02}cqw`,
              fontWeight:
                field.key === "wor" || field.source === "notice" ? 700 : 400,
              color: field.key === "wor" ? "#dc2626" : undefined,
              lineHeight: `${(field.leading || 21) / 11.02}cqw`,
              whiteSpace: "pre-wrap",
              overflow: "hidden",
              textAlign: "left",
              alignContent: "start",
              display: "flex",
              alignItems: "flex-start",
              overflowWrap: "anywhere",
              padding: 0,
            } as CSSProperties;
            return editable ? (
              <button
                type="button"
                key={index}
                aria-label={`${field.label}: ${value || "empty"}`}
                title={field.label}
                className={`form-overlay-field rounded-sm bg-blue-500/5 text-left ring-1 ring-blue-500/20 hover:bg-blue-500/15 focus-visible:outline-2 focus-visible:outline-blue-600 ${onLayoutChange ? "touch-none cursor-move" : ""} ${selectedField === field.label ? "!ring-2 !ring-blue-700 !bg-blue-500/15" : ""}`}
                style={style}
                onClick={() =>
                  onLayoutChange
                    ? onSelectField?.(field.label)
                    : setActive(field)
                }
                onPointerDown={(event) => beginDrag(event, field)}
                onPointerMove={moveDrag}
                onPointerUp={() => {
                  drag.current = undefined;
                }}
                onPointerCancel={() => {
                  drag.current = undefined;
                }}
              >
                {value || (
                  <span className="text-blue-700/60">{field.label}</span>
                )}
                {onLayoutChange && (
                  <span
                    data-resize="true"
                    aria-hidden="true"
                    className="absolute bottom-0 right-0 size-3 cursor-se-resize bg-blue-600"
                  />
                )}
              </button>
            ) : (
              <div key={index} style={style}>
                {value || (field.key === "wor" ? "Pending" : "")}
              </div>
            );
          })}
          <div role="radiogroup" aria-label="Service option — choose one">
            {formChoices.map((choice, index) => {
              const checked = choiceSelected(job, choice.label);
              return onChange ? (
                <button
                  key={choice.label}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={choice.label}
                  tabIndex={
                    checked ||
                    (!formChoices.some((c) => choiceSelected(job, c.label)) &&
                      index === 0)
                      ? 0
                      : -1
                  }
                  style={position(choice.x - 8, choice.y - 10, Math.max(choice.w + 16, 44), 44)}
                  className={`rounded-[50%] border-2 focus-visible:outline-2 focus-visible:outline-blue-600 ${checked ? "border-red-600" : "border-transparent hover:border-red-300"}`}
                  onClick={() =>
                    onChange(selectServiceOption(job, choice.label as FormOption))
                  }
                  onKeyDown={(event) => {
                    if (
                      [
                        "ArrowRight",
                        "ArrowDown",
                        "ArrowLeft",
                        "ArrowUp",
                      ].includes(event.key)
                    ) {
                      event.preventDefault();
                      const next =
                        (index +
                          (["ArrowRight", "ArrowDown"].includes(event.key)
                            ? 1
                            : 4)) %
                        5;
                      onChange(selectServiceOption(job, FORM_OPTIONS[next]));
                      (
                        event.currentTarget.parentElement?.children[
                          next
                        ] as HTMLElement
                      )?.focus();
                    }
                  }}
                />
              ) : checked ? (
                <div
                  key={choice.label}
                  style={position(choice.x - 4, choice.y - 3, choice.w + 8, 28)}
                  className="rounded-[50%] border-2 border-red-600"
                />
              ) : null;
            })}
          </div>
          {SIGNATURE_MARKS.map((mark, i) => (
            <div key={mark.key} style={position(mark.x, mark.y, mark.w, mark.h)}>
              {onChange ? (
                <button
                  type="button"
                  className="h-full w-full rounded bg-blue-500/5 ring-1 ring-blue-500/20"
                  aria-label={i ? "Customer signature" : "Technician signature"}
                  onClick={() => setSign(mark.key)}
                >
                  {job[mark.key] ? (
                    <SignatureImage value={job[mark.key]} />
                  ) : (
                    <span style={{ fontSize: "1.2cqw" }}>Tap to sign</span>
                  )}
                </button>
              ) : (
                <SignatureImage value={job[mark.key]} />
              )}
            </div>
          ))}
        </article>
      </div>
      <Dialog
        open={!!active}
        onOpenChange={(open) => !open && setActive(undefined)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogTitle>{active?.label}</DialogTitle>
          <DialogDescription>
            Changes appear in their position on the customer form. Long text
            continues on an extra PDF page.
          </DialogDescription>
          {active && suggestions && history && isHistoryField(active) ? (
            <HistoryDialogField
              field={active}
              job={job}
              suggestions={suggestions}
              history={history}
              onContact={(value) => update(active, value)}
            />
          ) : active?.key === "modelNo" && history ? (
            <textarea
              autoFocus
              aria-label={active.label}
              className="min-h-24 w-full rounded-lg border p-3 text-base"
              value={formValue(job, active)}
              onChange={(event) => history.changeModel(event.target.value)}
            />
          ) : active?.type === "time" ? (
            <ClockTimeInput
              id={`form-${active.key}`}
              label={active.label}
              value={String(job.line[active.key as keyof typeof job.line] ?? "")}
              onChange={(value) => update(active, value)}
            />
          ) : (
            active && (
              <>
                {active.type ? (
                  <input
                    autoFocus
                    type={active.type}
                    aria-label={active.label}
                    className="min-h-12 w-full rounded-lg border p-3 text-base"
                    value={formValue(job, active)}
                    onChange={(e) => update(active, e.target.value)}
                  />
                ) : (
                  <textarea
                    autoFocus
                    aria-label={active.label}
                    className="min-h-32 w-full rounded-lg border p-3 text-base"
                    value={formValue(job, active)}
                    onChange={(e) => update(active, e.target.value)}
                    placeholder={
                      active.type === "date" ? "YYYY-MM-DD" : active.label
                    }
                  />
                )}
              </>
            )
          )}
          {active && (
            <button
              type="button"
              className="min-h-12 rounded-lg bg-primary px-4 text-primary-foreground"
              onClick={() => setActive(undefined)}
            >
              Done
            </button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!sign}
        onOpenChange={(open) => !open && setSign(undefined)}
      >
        <DialogContent className="w-[96vw] sm:max-w-4xl">
          <DialogTitle>
            {sign === "signature"
              ? "Customer approval"
              : "Technician signature"}
          </DialogTitle>
          <DialogDescription>
            Sign with a finger, pen or mouse.
          </DialogDescription>
          {sign && (
            <SignaturePad
              label="Signature"
              value={job[sign]}
              onChange={(value) => onChange?.({ ...job, [sign]: value })}
            />
          )}
          <button
            type="button"
            className="min-h-12 rounded-lg bg-primary text-primary-foreground"
            onClick={() => setSign(undefined)}
          >
            Done
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
const HISTORY_KEYS = new Set([
  "customer",
  "clientAddress",
  "phone",
  "requesterName",
  "requesterEmail",
  "serialNo",
]);
function isHistoryField(field: FormField) {
  return HISTORY_KEYS.has(String(field.key));
}
function HistoryDialogField({
  field,
  job,
  suggestions,
  history,
  onContact,
}: {
  field: FormField;
  job: FieldJob;
  suggestions: FieldSuggestions;
  history: FieldHistoryHandlers;
  onContact: (value: string) => void;
}) {
  const value =
    field.source === "fields"
      ? job.fields[field.key as keyof ContactFields] || ""
      : formValue(job, field);
  const customer = job.line.customer;
  const contacts = contactsFor(customer, suggestions);
  const machines = serialOptions(customer, suggestions);
  if (field.key === "customer")
    return (
      <SuggestInput
        id="paper-customer"
        label="Client name"
        value={value}
        suggestions={suggestions.customers}
        autoFocus
        listMode="inline"
        placeholder="Start typing a customer"
        hint="Pick a saved customer to fill the site when one site is on file."
        onFocus={history.focusCustomer}
        onChange={history.changeCustomer}
        onCommit={history.commitCustomer}
        onPick={history.commitCustomer}
      />
    );
  if (field.key === "serialNo")
    return (
      <SuggestInput
        id="paper-serial"
        label="Serial number"
        value={value}
        suggestions={machines}
        limit={40}
        autoFocus
        listMode="inline"
        placeholder={machines.length ? "Filter serial or model" : "Serial number"}
        hint={machineHint(customer, machines.length)}
        onChange={history.changeSerial}
        onCommit={history.commitSerial}
        onPick={history.pickSerial}
      />
    );
  const contact =
    field.key === "clientAddress"
      ? {
          id: "paper-address",
          label: "Client address",
          type: "text",
          options: contacts.addresses,
          hint: customer.trim()
            ? "Saved addresses for this customer. Picking one does not change the other fields."
            : "Choose a customer first. Addresses stay limited to that customer.",
        }
      : field.key === "phone"
        ? {
            id: "paper-phone",
            label: "Phone number",
            type: "tel",
            options: contacts.phones,
            hint: customer.trim()
              ? "Saved phone numbers for this customer."
              : "Choose a customer first.",
          }
        : field.key === "requesterName"
          ? {
              id: "paper-requester",
              label: "Requester name",
              type: "text",
              options: contacts.requesters,
              hint: customer.trim()
                ? "Saved requester names for this customer."
                : "Choose a customer first.",
            }
          : {
              id: "paper-email",
              label: "Customer email",
              type: "email",
              options: contacts.emails,
              hint: customer.trim()
                ? "Saved customer emails for this customer."
                : "Choose a customer first.",
            };
  return (
    <SuggestInput
      id={contact.id}
      label={contact.label}
      type={contact.type}
      value={value}
      suggestions={contact.options}
      autoFocus
      listMode="inline"
      hint={contact.hint}
      onChange={onContact}
      onCommit={onContact}
    />
  );
}
