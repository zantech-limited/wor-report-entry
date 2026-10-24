import type { FieldJob } from "./field-model";
import {
  EMPTY_SUGGESTIONS,
  applyCustomerChange,
  locationsFor,
  machinesFor,
  matchMachine,
  modelForSerial,
  type Suggestions,
} from "./model";

export type CustomerContacts = {
  addresses: string[];
  phones: string[];
  requesters: string[];
  emails: string[];
};

/** Workbook suggestions plus addresses and contacts stored on field work orders. */
export type FieldSuggestions = Suggestions & {
  contactsByCustomer: Record<string, CustomerContacts>;
};

export const EMPTY_FIELD_SUGGESTIONS: FieldSuggestions = {
  ...EMPTY_SUGGESTIONS,
  contactsByCustomer: {},
};

export type FieldTouch = {
  customerAtFocus: string;
  modelTouched: boolean;
  locationTouched: boolean;
  serialAtEdit: string;
  autofillModel: string;
  autofillLocation: string;
};

export const emptyFieldTouch = (): FieldTouch => ({
  customerAtFocus: "",
  modelTouched: false,
  locationTouched: false,
  serialAtEdit: "",
  autofillModel: "",
  autofillLocation: "",
});

export function isFieldSuggestions(value: unknown): value is FieldSuggestions {
  if (!value || typeof value !== "object") return false;
  const item = value as FieldSuggestions;
  return (
    Array.isArray(item.customers) &&
    Array.isArray(item.techs) &&
    !!item.locationsByCustomer &&
    typeof item.locationsByCustomer === "object" &&
    !!item.machinesByCustomer &&
    typeof item.machinesByCustomer === "object" &&
    !!item.contactsByCustomer &&
    typeof item.contactsByCustomer === "object"
  );
}

export function contactsFor(
  customer: string,
  suggestions: FieldSuggestions,
): CustomerContacts {
  const key =
    suggestions.customers.find(
      (name) => name.toLowerCase() === customer.trim().toLowerCase(),
    ) ?? customer.trim();
  return (
    suggestions.contactsByCustomer[key] ?? {
      addresses: [],
      phones: [],
      requesters: [],
      emails: [],
    }
  );
}

export function serialOptions(customer: string, suggestions: Suggestions) {
  return machinesFor(customer, suggestions).map((machine) => ({
    value: machine.serialNo,
    label: machine.serialNo,
    description: [machine.modelNo, machine.location].filter(Boolean).join(" · "),
  }));
}

export function siteHint(
  customer: string,
  location: string,
  suggestions: Suggestions,
) {
  const sites = locationsFor(customer, suggestions);
  if (sites.length === 1 && location === sites[0])
    return `${sites[0]} is the only site on file for ${customer}.`;
  if (sites.length > 1)
    return `${sites.length} sites on file for ${customer}. Type to filter that list.`;
  if (customer.trim())
    return "No saved site for this customer yet. Type one and it will be remembered with them.";
  return "Choose a customer first. The site list stays limited to that customer.";
}

export function machineHint(customer: string, count: number) {
  if (!customer.trim())
    return "Choose a customer first. Machines stay limited to that customer.";
  if (count)
    return `${count} machines on file for ${customer}. Pick one, or type a new serial.`;
  return "No machines on file for this customer. Type the serial. A saved model fills in when this serial is already known.";
}

/**
 * Field work orders have no prefix map. A brand-new serial stays blank
 * instead of becoming "Unknown Model".
 */
export function fieldModelForSerial(serial: string, historyModel = "") {
  const model = modelForSerial(serial, [], historyModel);
  return model === "Unknown Model" ? "" : model;
}

export function commitFieldCustomer(
  job: FieldJob,
  previousCustomer: string,
  nextCustomer: string,
  suggestions: Suggestions,
  touch: FieldTouch,
): { job: FieldJob; touch: FieldTouch } {
  const applied = applyCustomerChange(
    previousCustomer,
    nextCustomer,
    job.line.location,
    suggestions,
  );
  const nextTouch = { ...touch, customerAtFocus: applied.customer };
  if (applied.location !== job.line.location)
    nextTouch.autofillLocation = applied.location;
  if (
    applied.customer === job.line.customer &&
    applied.location === job.line.location
  )
    return { job, touch: nextTouch };
  return {
    job: {
      ...job,
      line: {
        ...job.line,
        customer: applied.customer,
        location: applied.location,
      },
    },
    touch: nextTouch,
  };
}

export function commitFieldSerial(
  job: FieldJob,
  value: string,
  suggestions: Suggestions,
  touch: FieldTouch,
  force: boolean,
): { job: FieldJob; touch: FieldTouch } {
  const machine = matchMachine(job.line.customer, value, suggestions);
  const serial = force && machine ? machine.serialNo : value;
  const next = { ...job.line, serialNo: serial };
  const prefix = serial.trim().slice(0, 3);
  const previous = touch.serialAtEdit.trim().slice(0, 3);
  const prefixChanged =
    prefix.length >= 3 && prefix.toLowerCase() !== previous.toLowerCase();
  const nextTouch = { ...touch };
  if (prefix.length < 3) nextTouch.serialAtEdit = serial;
  const model = fieldModelForSerial(serial, machine?.modelNo ?? "");
  const canReplaceModel =
    !touch.modelTouched &&
    (!job.line.modelNo.trim() || job.line.modelNo === touch.autofillModel);
  if (force || canReplaceModel) {
    if (machine || prefixChanged || (model && !job.line.modelNo.trim())) {
      if (model) {
        next.modelNo = model;
        nextTouch.autofillModel = model;
      }
    } else if (!serial.trim() && !job.line.modelNo.trim()) {
      next.modelNo = "";
      nextTouch.autofillModel = "";
    }
  }
  if (prefix.length >= 3) nextTouch.serialAtEdit = serial;
  if (
    machine?.location &&
    (force || (!touch.locationTouched && !job.line.location.trim()))
  ) {
    next.location = machine.location;
    nextTouch.autofillLocation = machine.location;
  }
  if (force) {
    nextTouch.modelTouched = false;
    nextTouch.locationTouched = false;
  }
  if (
    next.serialNo === job.line.serialNo &&
    next.modelNo === job.line.modelNo &&
    next.location === job.line.location
  )
    return { job, touch: nextTouch };
  return { job: { ...job, line: next }, touch: nextTouch };
}
