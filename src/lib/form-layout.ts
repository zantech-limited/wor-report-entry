import type {
  CustomerSnapshot,
  ContactFields,
  FormOption,
} from "./field-model";
import type { WorkOrder } from "./model";
import { crewNames } from "./crew";

// Pixel coordinates on the original 1102 × 1427 customer form.
export type FormField = {
  label: string;
  source: "line" | "fields" | "crew" | "notice";
  key: keyof ContactFields | keyof WorkOrder | "crew" | "noCharge";
  x: number;
  y: number;
  w: number;
  h: number;
  type?: string;
  size?: number;
  leading?: number;
};
export const FORM_WIDTH = 1102,
  FORM_HEIGHT = 1427;
export type FieldBox = Pick<FormField, "x" | "y" | "w" | "h"> & {
  size: number;
  leading: number;
};
export type FormLayout = Record<string, FieldBox>;
export function defaultFormLayout(): FormLayout {
  return Object.fromEntries(
    formFields.map((field) => [
      field.label,
      {
        x: field.x,
        y: field.y,
        w: field.w,
        h: field.h,
        size: field.size || 16,
        leading: field.leading || 21,
      },
    ]),
  );
}
export function fieldsForLayout(layout?: FormLayout): FormField[] {
  return layout
    ? formFields.map((field) => ({ ...field, ...layout[field.label] }))
    : formFields;
}
export function validateFormLayout(input: unknown): FormLayout {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid form layout.");
  const layout = input as FormLayout;
  if (Object.keys(layout).length !== formFields.length)
    throw new Error("Invalid form layout fields.");
  const clean: FormLayout = {};
  for (const field of formFields) {
    const box = layout[field.label];
    if (
      !box ||
      [box.x, box.y, box.w, box.h, box.size, box.leading].some(
        (value) => typeof value !== "number" || !Number.isFinite(value),
      ) ||
      box.x < 0 ||
      box.y < 0 ||
      box.w < 20 ||
      box.h < 16 ||
      box.x + box.w > FORM_WIDTH ||
      box.y + box.h > FORM_HEIGHT ||
      box.size < 8 ||
      box.size > 40 ||
      box.leading < box.size ||
      box.leading > 80
    )
      throw new Error(
        `Invalid form area: ${field.label}. Keep it inside the page; use font sizes 8–40 and line spacing at least the font size.`,
      );
    clean[field.label] = {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      size: box.size,
      leading: box.leading,
    };
  }
  return clean;
}
export const formFields: FormField[] = [
  {
    label: "No charge notice",
    source: "notice",
    key: "noCharge",
    x: 889,
    y: 61,
    w: 153,
    h: 28,
    size: 22,
    leading: 26,
  },
  {
    label: "Request number",
    source: "line",
    key: "wor",
    x: 889,
    y: 91,
    w: 153,
    h: 36,
    size: 22,
    leading: 26,
  },
  {
    label: "Client name",
    source: "line",
    key: "customer",
    x: 79,
    y: 202,
    w: 433,
    h: 51,
  },
  {
    label: "Client address",
    source: "fields",
    key: "clientAddress",
    x: 526,
    y: 202,
    w: 496,
    h: 51,
  },
  {
    label: "Scheduled date",
    source: "fields",
    key: "scheduledDate",
    x: 79,
    y: 320,
    w: 193,
    h: 25,
    type: "date",
  },
  {
    label: "Phone number",
    source: "fields",
    key: "phone",
    x: 286,
    y: 320,
    w: 225,
    h: 25,
    type: "tel",
  },
  {
    label: "Requester name",
    source: "fields",
    key: "requesterName",
    x: 526,
    y: 320,
    w: 285,
    h: 25,
  },
  {
    label: "Customer email",
    source: "fields",
    key: "requesterEmail",
    x: 826,
    y: 320,
    w: 196,
    h: 25,
    type: "email",
    size: 13,
  },
  {
    label: "Technicians",
    source: "crew",
    key: "crew",
    x: 79,
    y: 378,
    w: 433,
    h: 40,
  },
  {
    label: "Work required",
    source: "fields",
    key: "workRequired",
    x: 526,
    y: 378,
    w: 496,
    h: 40,
  },
  {
    label: "Work carried out",
    source: "fields",
    key: "workCarriedOut",
    x: 79,
    y: 466,
    w: 943,
    h: 298,
    leading: 30,
  },
  {
    label: "Part numbers",
    source: "line",
    key: "partNo",
    x: 79,
    y: 806,
    w: 115,
    h: 168,
    leading: 29.5,
    size: 14,
  },
  {
    label: "Material descriptions",
    source: "line",
    key: "description",
    x: 198,
    y: 806,
    w: 267,
    h: 168,
    leading: 29.5,
    size: 14,
  },
  {
    label: "Quantities",
    source: "line",
    key: "qty",
    x: 470,
    y: 806,
    w: 42,
    h: 168,
    leading: 29.5,
    size: 14,
  },
  {
    label: "Model",
    source: "line",
    key: "modelNo",
    x: 530,
    y: 806,
    w: 231,
    h: 23,
  },
  {
    label: "Serial number",
    source: "line",
    key: "serialNo",
    x: 530,
    y: 835,
    w: 231,
    h: 23,
  },
  {
    label: "Copy count",
    source: "line",
    key: "copycount",
    x: 530,
    y: 865,
    w: 215,
    h: 23,
  },
  {
    label: "Other work performed",
    source: "fields",
    key: "otherPerformed",
    x: 79,
    y: 1017,
    w: 433,
    h: 66,
  },
  {
    label: "Other work needed",
    source: "fields",
    key: "otherNeeded",
    x: 526,
    y: 1017,
    w: 496,
    h: 66,
  },
  {
    label: "Date started",
    source: "fields",
    key: "startedDate",
    x: 79,
    y: 1132,
    w: 193,
    h: 21,
    type: "date",
    size: 14,
  },
  {
    label: "Time started",
    source: "line",
    key: "arrivalTime",
    x: 287,
    y: 1132,
    w: 225,
    h: 21,
    type: "time",
    size: 14,
  },
  {
    label: "Date completed",
    source: "fields",
    key: "completedDate",
    x: 526,
    y: 1132,
    w: 222,
    h: 21,
    type: "date",
    size: 14,
  },
  {
    label: "Time completed",
    source: "line",
    key: "departureTime",
    x: 763,
    y: 1132,
    w: 259,
    h: 21,
    type: "time",
    size: 14,
  },
  {
    label: "Completed by",
    source: "fields",
    key: "completedByName",
    x: 216,
    y: 1204,
    w: 230,
    h: 30,
  },
  {
    label: "Technician designation",
    source: "fields",
    key: "completedByDesignation",
    x: 665,
    y: 1204,
    w: 172,
    h: 30,
  },
  {
    label: "Completion date",
    source: "fields",
    key: "completedDate",
    x: 849,
    y: 1204,
    w: 173,
    h: 30,
    type: "date",
  },
  {
    label: "Approved by",
    source: "fields",
    key: "approvedByName",
    x: 216,
    y: 1308,
    w: 230,
    h: 30,
  },
  {
    label: "Customer designation",
    source: "fields",
    key: "approvedByDesignation",
    x: 665,
    y: 1308,
    w: 172,
    h: 30,
  },
  {
    label: "Approval date",
    source: "fields",
    key: "approvedDate",
    x: 849,
    y: 1308,
    w: 173,
    h: 30,
    type: "date",
  },
];
export function formValue(
  job: Pick<CustomerSnapshot, "line" | "fields">,
  field: FormField,
): string {
  if (field.source === "notice")
    return job.line.paymentMethod.toLowerCase() === "no charge" &&
      !["Cash", "Charge"].includes(job.fields.serviceOption || "")
      ? "NO CHARGE"
      : "";
  if (field.source === "crew") {
    const names = crewNames(job.line as WorkOrder);
    return names.length ? names.join(", ") : job.fields.completedByName.trim();
  }
  if (field.source === "fields")
    return (
      job.fields[field.key as keyof ContactFields] ||
      (field.key === "clientAddress" ? job.line.location : "")
    );
  return String(job.line[field.key as keyof typeof job.line] ?? "");
}
export const formChoices = [
  { label: "Rental", x: 612, y: 899, w: 57 },
  { label: "ServMaint", x: 704, y: 899, w: 81 },
  { label: "Charge", x: 807, y: 899, w: 60 },
  { label: "Cash", x: 902, y: 899, w: 49 },
  { label: "PM", x: 782, y: 931, w: 33 },
];
/** Circle one paper-form option and align the workbook column that option represents. */
export function selectServiceOption<
  T extends {
    line: { paymentMethod: string; slaType: string; serviceType: string };
    fields: ContactFields;
  },
>(job: T, option: FormOption): T {
  const line = { ...job.line };
  if (option === "Cash") line.paymentMethod = "Cash";
  if (
    option === "Charge" &&
    ["", "no charge", "cash"].includes(line.paymentMethod.trim().toLowerCase())
  )
    line.paymentMethod = "";
  if (option === "Rental") line.slaType = "Rental";
  if (option === "ServMaint") line.slaType = "ServMaint";
  if (option === "PM") line.serviceType = "PM";
  return {
    ...job,
    line,
    fields: { ...job.fields, serviceOption: option },
  };
}
export function choiceSelected(
  job: Pick<CustomerSnapshot, "line" | "fields">,
  label: string,
) {
  const line = job.line;
  if (job.fields.serviceOption) return job.fields.serviceOption === label;
  if (line.paymentMethod.toLowerCase() === "no charge") return false;
  // Legacy jobs have separate billing/service values; derive one selection.
  const selected =
    line.paymentMethod.toLowerCase() === "cash"
      ? "Cash"
      : Number(line.revenue.replace(/[$,]/g, "")) > 0
        ? "Charge"
        : line.slaType.toLowerCase() === "rental"
          ? "Rental"
          : line.slaType.toLowerCase() === "servmaint"
            ? "ServMaint"
            : line.serviceType === "PM"
              ? "PM"
              : "";
  return selected === label;
}
