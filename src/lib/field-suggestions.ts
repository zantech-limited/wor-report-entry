import type { Actor } from "./accounts";
import { customerSettings } from "./customers";
import { getSuggestions } from "./db";
import type { FieldJob } from "./field-model";
import type { FieldSuggestions, CustomerContacts } from "./field-suggestion-model";
import {
  canonicalize,
  isBlankLine,
  nameKey,
  uniqueNames,
  type MachineRecord,
  type Suggestions,
  type WorkOrder,
} from "./model";
import { records } from "./records";
import { database } from "./storage";

type Visit = {
  customer: string;
  location: string;
  serialNo: string;
  modelNo: string;
  address: string;
  phone: string;
  requester: string;
  email: string;
};

const emptyContacts = (): CustomerContacts => ({
  addresses: [],
  phones: [],
  requesters: [],
  emails: [],
});

function sortedUnique(values: string[]) {
  return uniqueNames(values).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/**
 * Suggestion values for the field form. Every signed-in role sees customers,
 * sites, machines and contacts from every monthly entry and every field work
 * order. Opening a work order is still limited by canSeeJob.
 */
export async function suggestionsForActor(
  actor: Actor,
): Promise<FieldSuggestions> {
  if (!actor.id) throw new Error("Sign in with an approved account.");
  const db = await database();
  const [full, jobs, reportRows, settings] = await Promise.all([
    getSuggestions(),
    records<FieldJob>("job"),
    db.query("SELECT lines FROM reports"),
    customerSettings(),
  ]);
  const visits: Visit[] = [];
  for (const row of jobs) {
    const job = row.data;
    visits.push({
      customer: job.line.customer,
      location: job.line.location,
      serialNo: job.line.serialNo,
      modelNo: job.line.modelNo,
      address: job.fields.clientAddress,
      phone: job.fields.phone,
      requester: job.fields.requesterName,
      email: job.fields.requesterEmail,
    });
  }
  for (const source of reportRows) {
    const lines = JSON.parse(String(source.lines)) as WorkOrder[];
    for (const line of lines) {
      if (isBlankLine(line)) continue;
      visits.push({
        customer: line.customer,
        location: line.location,
        serialNo: line.serialNo,
        modelNo: line.modelNo,
        address: "",
        phone: "",
        requester: "",
        email: "",
      });
    }
  }
  return mergeVisits(full, visits, settings);
}

function customerName(
  raw: string,
  full: Suggestions,
  settings: Awaited<ReturnType<typeof customerSettings>>,
) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const canonical = settings.canonical(trimmed).trim();
  if (!canonical) return "";
  const listed = full.customers.find(
    (name) => nameKey(name) === nameKey(canonical),
  );
  if (listed) return listed;
  for (const [name, active] of settings.states) {
    if (!active && nameKey(name) === nameKey(canonical)) return "";
    if (!active && nameKey(name) === nameKey(trimmed)) return "";
  }
  return canonical;
}

function locationName(customer: string, raw: string, full: Suggestions) {
  const sites = full.locationsByCustomer[customer] ?? [];
  return canonicalize(raw, sites);
}

function mergeVisits(
  full: Suggestions,
  visits: Visit[],
  settings: Awaited<ReturnType<typeof customerSettings>>,
): FieldSuggestions {
  const customers = [...full.customers];
  const locationsByCustomer: Record<string, string[]> = {};
  for (const [name, sites] of Object.entries(full.locationsByCustomer))
    locationsByCustomer[name] = [...sites];
  const machinesByCustomer: Record<string, MachineRecord[]> = {};
  for (const [name, machines] of Object.entries(full.machinesByCustomer))
    machinesByCustomer[name] = machines.map((machine) => ({ ...machine }));
  const contacts = new Map<string, CustomerContacts>();
  for (const visit of visits) {
    const customer = customerName(visit.customer, full, settings);
    if (!customer) continue;
    if (!customers.some((name) => nameKey(name) === nameKey(customer)))
      customers.push(customer);
    const location = visit.location.trim()
      ? locationName(customer, visit.location, {
          ...full,
          locationsByCustomer,
        })
      : "";
    if (
      location &&
      !(locationsByCustomer[customer] ?? []).some(
        (site) => nameKey(site) === nameKey(location),
      )
    ) {
      locationsByCustomer[customer] = sortedUnique([
        ...(locationsByCustomer[customer] ?? []),
        location,
      ]);
    }
    const serial = visit.serialNo.trim();
    if (
      serial &&
      !(machinesByCustomer[customer] ?? []).some(
        (machine) => machine.serialNo.toLowerCase() === serial.toLowerCase(),
      )
    ) {
      machinesByCustomer[customer] = [
        ...(machinesByCustomer[customer] ?? []),
        {
          serialNo: serial,
          modelNo:
            visit.modelNo.trim() === "Unknown Model"
              ? ""
              : visit.modelNo.trim(),
          location,
        },
      ];
    }
    rememberContacts(contacts, customer, visit);
  }
  return {
    customers: sortedUnique(customers),
    locationsByCustomer,
    techs: full.techs,
    machinesByCustomer,
    contactsByCustomer: contactRecord(contacts),
  };
}

function rememberContacts(
  contacts: Map<string, CustomerContacts>,
  customer: string,
  visit: Visit,
) {
  const current = contacts.get(customer) ?? emptyContacts();
  if (visit.address.trim()) current.addresses.push(visit.address.trim());
  if (visit.phone.trim()) current.phones.push(visit.phone.trim());
  if (visit.requester.trim()) current.requesters.push(visit.requester.trim());
  if (visit.email.trim()) current.emails.push(visit.email.trim());
  contacts.set(customer, current);
}

function contactRecord(contacts: Map<string, CustomerContacts>) {
  const result: Record<string, CustomerContacts> = {};
  for (const [customer, values] of contacts) {
    const next = {
      addresses: sortedUnique(values.addresses),
      phones: sortedUnique(values.phones),
      requesters: sortedUnique(values.requesters),
      emails: sortedUnique(values.emails),
    };
    if (
      next.addresses.length ||
      next.phones.length ||
      next.requesters.length ||
      next.emails.length
    )
      result[customer] = next;
  }
  return result;
}
