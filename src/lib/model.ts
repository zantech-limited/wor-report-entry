import { workOrderId } from "./work-order-id";
export const SERVICE_TYPES = [
  "PM",
  "Per Call",
  "Install",
  "Re-visit",
  "Warranty",
  "Assessment",
  "Courtesy",
  "Discovery",
  "Issue",
  "Service",
  "PFS",
  "Delivery",
  "Training",
  "Internal",
] as const;

export const SLA_TYPES = [
  "Gold",
  "Silver",
  "Bronze",
  "Rental",
  "N/A",
  "ServMaint",
] as const;

export const PARTS_REQUIRED = ["Yes", "No"] as const;

export const PAYMENT_METHODS = [
  "No charge",
  "Cash",
  "PO",
  "Cheque",
  "Online",
  "Showroom",
] as const;

export const JOB_STATUSES = [
  "In Progress",
  "Awaiting Parts",
  "Customer rescheduled",
  "Completed",
] as const;

export const FTF_VALUES = ["Yes", "No", "N/A"] as const;

export type WorkOrder = {
  id: string;
  no: string;
  wor: string;
  date: string;
  customer: string;
  location: string;
  serviceType: string;
  slaType: string;
  modelNo: string;
  serialNo: string;
  copycount: string;
  technician: string;
  secondaryTech: string;
  arrivalTime: string;
  departureTime: string;
  partsRequired: string;
  partNo: string;
  description: string;
  qty: string;
  iro: string;
  paymentMethod: string;
  revenue: string;
  jobStatus: string;
  ftf: string;
  comments: string;
};

export type PrefixEntry = {
  prefix: string;
  model: string;
};

export type Report = {
  id: string;
  title: string;
  preparedBy: string;
  sourceFilename: string | null;
  createdAt: string;
  updatedAt: string;
  monthKey?: string;
  prefixMap: PrefixEntry[];
  lines: WorkOrder[];
};

export type ReportSummary = {
  id: string;
  title: string;
  preparedBy: string;
  sourceFilename: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  monthLabel: string;
};

export type MachineRecord = {
  serialNo: string;
  modelNo: string;
  location: string;
};

export type Suggestions = {
  customers: string[];
  locationsByCustomer: Record<string, string[]>;
  techs: string[];
  machinesByCustomer: Record<string, MachineRecord[]>;
};

export type WorkEntry = {
  partNo?: string;
  reportId: string;
  lineIndex: number;
  monthLabel: string;
  date: string;
  no: string;
  wor: string;
  customer: string;
  location: string;
  serviceType: string;
  slaType: string;
  modelNo: string;
  serialNo: string;
  technician: string;
  secondaryTech: string;
  hours: number | null;
  jobStatus: string;
  revenue: number | null;
};

export const EMPTY_SUGGESTIONS: Suggestions = {
  customers: [],
  locationsByCustomer: {},
  techs: [],
  machinesByCustomer: {},
};

const LINE_FIELDS: (keyof WorkOrder)[] = [
  "no",
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
  "iro",
  "paymentMethod",
  "revenue",
  "jobStatus",
  "ftf",
  "comments",
];

export function blankLine(no = ""): WorkOrder {
  return {
    id: workOrderId(),
    no,
    wor: "",
    date: "",
    customer: "",
    location: "",
    serviceType: "",
    slaType: "",
    modelNo: "",
    serialNo: "",
    copycount: "",
    technician: "",
    secondaryTech: "",
    arrivalTime: "",
    departureTime: "",
    partsRequired: "",
    partNo: "",
    description: "",
    qty: "",
    iro: "",
    paymentMethod: "",
    revenue: "",
    jobStatus: "",
    ftf: "",
    comments: "",
  };
}

export function isBlankLine(line: WorkOrder): boolean {
  return LINE_FIELDS.every((key) => String(line[key] ?? "").trim() === "");
}

export function nextLineNo(lines: WorkOrder[]): string {
  let max = 0;
  for (const line of lines) {
    const n = Number(line.no);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return String(max + 1);
}

export function prefixOf(serial: string): string {
  return serial.trim().slice(0, 3);
}

export function lookupModel(serial: string, map: PrefixEntry[]): string | null {
  const prefix = prefixOf(serial);
  if (prefix.length < 3) return null;
  const exact = map.find((entry) => entry.prefix === prefix);
  if (exact) return exact.model;
  const loose = map.find(
    (entry) => entry.prefix.toLowerCase() === prefix.toLowerCase(),
  );
  return loose ? loose.model : null;
}

export function minutesOf(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Hours on site, wrapping past midnight the way the Master Time Taken formula does. */
export function timeTakenHours(arrival: string, departure: string): number | null {
  const start = minutesOf(arrival);
  const end = minutesOf(departure);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

export function formatHours(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  const clock =
    minutes === 60
      ? `${whole + 1}h 00m`
      : `${whole}h ${String(minutes).padStart(2, "0")}m`;
  return `${hours.toFixed(2)} h (${clock})`;
}

export function monthLabelFromDate(iso: string | undefined): string {
  if (!iso) return "Month not set";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "Month not set";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${name} ${year}`;
}

export function reportMonthLabel(lines: WorkOrder[]): string {
  const first = lines.find((line) => line.date)?.date;
  return monthLabelFromDate(first);
}

export function fileMonthStamp(lines: WorkOrder[],monthKey?:string): string {
  const first = monthKey ? `${monthKey}-01` : lines.find((line) => line.date)?.date;
  const match = first ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(first) : null;
  if (!match) return "undated";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `${name} ${String(year).slice(2)}`;
}

export function canonicalize(value: string, options: string[]): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const matches = options.filter(
    (option) => option.toLowerCase() === trimmed.toLowerCase(),
  );
  return matches.length === 1 ? matches[0] : trimmed;
}

export function locationsFor(
  customer: string,
  suggestions: Suggestions,
): string[] {
  const key = canonicalize(customer, suggestions.customers);
  if (!key) return [];
  return suggestions.locationsByCustomer[key] ?? [];
}

export function machinesFor(
  customer: string,
  suggestions: Suggestions,
): MachineRecord[] {
  const key = canonicalize(customer, suggestions.customers);
  if (!key) return [];
  return suggestions.machinesByCustomer[key] ?? [];
}

export function matchMachine(
  customer: string,
  serial: string,
  suggestions: Suggestions,
): MachineRecord | null {
  const needle = serial.trim().toLowerCase();
  if (!needle) return null;
  const matches = machinesFor(customer, suggestions).filter(
    (machine) => machine.serialNo.toLowerCase() === needle,
  );
  return matches.length === 1 ? matches[0] : null;
}

/** Prefix map first, then the model stored on past visits, then Unknown Model. */
export function modelForSerial(
  serial: string,
  map: PrefixEntry[],
  historyModel = "",
): string {
  const fromPrefix = lookupModel(serial, map);
  if (fromPrefix) return fromPrefix;
  const historical = historyModel.trim();
  if (historical && historical !== "Unknown Model") return historical;
  if (prefixOf(serial).length >= 3) return "Unknown Model";
  return "";
}

export function applyCustomerChange(
  previousCustomer: string,
  nextCustomer: string,
  location: string,
  suggestions: Suggestions,
): { customer: string; location: string } {
  const customer = canonicalize(nextCustomer, suggestions.customers);
  if (
    customer.toLowerCase() === previousCustomer.trim().toLowerCase() &&
    customer !== ""
  ) {
    return { customer, location };
  }
  const locs = locationsFor(customer, suggestions);
  if (locs.length === 1) return { customer, location: locs[0] };
  if (locs.length > 1) {
    const keep = locs.find(
      (item) => item.toLowerCase() === location.trim().toLowerCase(),
    );
    return { customer, location: keep ?? "" };
  }
  return { customer, location: "" };
}
