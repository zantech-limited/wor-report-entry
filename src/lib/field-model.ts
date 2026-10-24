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
