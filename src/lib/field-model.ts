import { blankLine, type WorkOrder } from "./model";
export type Signature = { strokes: number[][][] };
export const CONTACT_FIELDS = [
  "clientAddress",
  "phone",
  "requesterName",
  "requesterEmail",
  "scheduledDate",
  "workRequired",
  "workCarriedOut",
  "otherPerformed",
  "otherNeeded",
  "startedDate",
  "completedDate",
  "completedByName",
  "completedByDesignation",
  "approvedByName",
  "approvedByDesignation",
  "approvedDate",
] as const;
export const FORM_OPTIONS = ["Rental", "ServMaint", "Charge", "Cash", "PM"] as const;
export type FormOption = (typeof FORM_OPTIONS)[number];
export type ContactFields = Record<(typeof CONTACT_FIELDS)[number], string> & { serviceOption?: FormOption };
export type FieldJob = {
  line: WorkOrder;
  fields: ContactFields;
  assignedIds: string[];
  state: "draft" | "submitted" | "amended";
  scheduleId: string;
  reportId: string;
  sourceUpdatedAt?: string;
  signature?: Signature;
  technicianSignature?: Signature;
  signedHash?: string;
  signedRevisionId?: string;
  amendmentReason?: string;
  amendedBy?: string;
  amendedAt?: string;
  savedOn?: string;
  savedAt?: string;
};
export function withLeadName(job: FieldJob, name: string): FieldJob {
  return {
    ...job,
    fields: { ...job.fields, completedByName: name },
    line: { ...job.line, technician: name },
  };
}
export function needsAmendmentReason(job: Pick<FieldJob, "state">) {
  return job.state === "submitted" || job.state === "amended";
}
export const emptyFields = () =>
  Object.fromEntries(
    CONTACT_FIELDS.map((field) => [field, ""]),
  ) as ContactFields;
export const emptyJob = (id: string): FieldJob => ({
  line: {
    ...blankLine(""),
    id,
    partsRequired: "No",
    paymentMethod: "No charge",
    revenue: "0",
    jobStatus: "In Progress",
  },
  fields: emptyFields(),
  assignedIds: [],
  state: "draft",
  scheduleId: "",
  reportId: "",
});
export function validSignature(input: unknown): input is Signature {
  if (
    !input ||
    typeof input !== "object" ||
    !Array.isArray((input as Signature).strokes)
  )
    return false;
  const strokes = (input as Signature).strokes;
  if (
    strokes.length < 1 ||
    strokes.length > 100 ||
    strokes.reduce(
      (sum, stroke) => sum + (Array.isArray(stroke) ? stroke.length : 10001),
      0,
    ) > 4000
  )
    return false;
  return (
    strokes.every(
      (stroke) =>
        Array.isArray(stroke) &&
        stroke.length > 1 &&
        stroke.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            point.every(
              (n) =>
                typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
            ),
        ),
    ) &&
    strokes.some((stroke) =>
      stroke.some(
        (point) =>
          Math.abs(point[0] - stroke[0][0]) +
            Math.abs(point[1] - stroke[0][1]) >
          0.02,
      ),
    )
  );
}
export function customerSnapshot(job: FieldJob) {
  const line = { ...job.line };
  for (const key of ["ftf", "comments", "iro", "no"] as const)
    delete (line as Partial<typeof line>)[key];
  return {
    line,
    fields: job.fields,
    signature: job.signature ?? null,
    technicianSignature: job.technicianSignature ?? null,
  };
}
export type CustomerSnapshot = ReturnType<typeof customerSnapshot>;

/**
 * Ink for the two signature lines. The bottom edge matches the printed line;
 * a taller box grows upward, beside the printed name and clear of the row below.
 */
export const SIGNATURE_MARKS = [
  { key: "technicianSignature" as const, x: 462, y: 1181, w: 200, h: 52 },
  { key: "signature" as const, x: 462, y: 1285, w: 200, h: 52 },
];

const LONG_FIELDS = new Set([
  "workRequired",
  "workCarriedOut",
  "otherPerformed",
  "otherNeeded",
]);

function previewText(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function previewSignature(value: unknown): Signature | null {
  if (value == null) return null;
  if (typeof value !== "object" || !Array.isArray((value as Signature).strokes))
    throw new Error("Invalid or empty signature.");
  const strokes = (value as Signature).strokes;
  let points = 0;
  if (!strokes.length || strokes.length > 500)
    throw new Error("Invalid or empty signature.");
  for (const stroke of strokes) {
    if (!Array.isArray(stroke) || stroke.length < 2)
      throw new Error("Invalid or empty signature.");
    points += stroke.length;
    for (const point of stroke) {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        point.some(
          (n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1,
        )
      )
        throw new Error("Invalid or empty signature.");
    }
  }
  if (points > 4000) throw new Error("Invalid or empty signature.");
  return { strokes };
}

/** Customer-visible fields from the open form, including signatures not yet saved. */
export function sanitizeCustomerSnapshot(input: unknown): CustomerSnapshot {
  if (!input || typeof input !== "object")
    throw new Error("Invalid work order preview.");
  const raw = input as {
    line?: unknown;
    fields?: unknown;
    signature?: unknown;
    technicianSignature?: unknown;
  };
  const lineSource =
    raw.line && typeof raw.line === "object"
      ? (raw.line as Record<string, unknown>)
      : {};
  const fieldSource =
    raw.fields && typeof raw.fields === "object"
      ? (raw.fields as Record<string, unknown>)
      : {};
  const job = emptyJob(
    previewText(lineSource.id, 80) || "00000000-0000-4000-8000-000000000000",
  );
  for (const key of Object.keys(blankLine()) as (keyof WorkOrder)[]) {
    if (key === "additionalTechs") {
      const extra = lineSource.additionalTechs;
      job.line.additionalTechs = Array.isArray(extra)
        ? extra
            .filter((name): name is string => typeof name === "string")
            .slice(0, 6)
            .map((name) => name.slice(0, 200))
        : [];
      continue;
    }
    if (key === "id") continue;
    job.line[key] = previewText(lineSource[key], 10000);
  }
  for (const key of CONTACT_FIELDS)
    job.fields[key] = previewText(
      fieldSource[key],
      LONG_FIELDS.has(key) ? 20000 : 512,
    );
  if (
    typeof fieldSource.serviceOption === "string" &&
    FORM_OPTIONS.includes(fieldSource.serviceOption as FormOption)
  )
    job.fields.serviceOption = fieldSource.serviceOption as FormOption;
  job.signature = previewSignature(raw.signature) ?? undefined;
  job.technicianSignature = previewSignature(raw.technicianSignature) ?? undefined;
  return customerSnapshot(job);
}

const SIGNED_LINE_KEYS = [
  "id",
  "wor",
  "date",
  "customer",
  "location",
  "serviceType",
  "slaType",
  "modelNo",
  "serialNo",
  "copycount",
  "technician",
  "secondaryTech",
  "arrivalTime",
  "departureTime",
  "partsRequired",
  "partNo",
  "description",
  "qty",
  "paymentMethod",
  "revenue",
  "jobStatus",
] as const;

function signedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Customer-visible content in a fixed shape. Timestamps, device labels, internal
 * notes, request-line numbers, and key order are not part of the signed preview.
 * A missing crew list and an empty one are the same content.
 */
export function canonicalSnapshot(job: FieldJob) {
  const line: Record<string, string | string[]> = {};
  for (const key of SIGNED_LINE_KEYS) line[key] = signedText(job.line?.[key]);
  const extra = job.line?.additionalTechs;
  line.additionalTechs = Array.isArray(extra)
    ? extra.map((name) => signedText(name)).filter(Boolean)
    : [];
  const fields: Record<string, string> = {};
  for (const key of CONTACT_FIELDS) fields[key] = signedText(job.fields?.[key]);
  if (job.fields?.serviceOption && FORM_OPTIONS.includes(job.fields.serviceOption))
    fields.serviceOption = job.fields.serviceOption;
  return {
    line,
    fields,
    signature: job.signature ?? null,
    technicianSignature: job.technicianSignature ?? null,
  };
}
export type Schedule = {
  assignedIds: string[];
  customer: string;
  location: string;
  start: string;
  end: string;
  workRequired: string;
  status: "scheduled" | "cancelled";
  jobId?: string;
};
export type Alert = {
  text: string;
  urgent: boolean;
  jobId?: string;
  acknowledged: boolean;
  sender: string;
};
