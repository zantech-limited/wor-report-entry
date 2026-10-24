import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { customerPdf } from "../src/lib/customer-pdf";
import { customerSnapshot, emptyJob } from "../src/lib/field-model";
import { createMonthlyPdf } from "../src/lib/report-pdf";
import {
  hasSupplementaryDetails,
  monthlyEntries,
} from "../src/lib/monthly-report";
import type { WorkEntry } from "../src/lib/model";
import { PDFDocument } from "pdf-lib";
import { formFields, formValue } from "../src/lib/form-layout";
async function main() {
  const job = emptyJob("00000000-0000-4000-8000-000000000001");
  Object.assign(job.line, {
    wor: "TEST-17713",
    date: "2026-10-22",
    customer: "Synthetic Customer",
    location: "Port of Spain",
    technician: "Tech One",
    secondaryTech: "Tech Two",
    additionalTechs: ["Tech Three", "Tech Four", "Tech Five", "Tech Six"],
    slaType: "Rental",
    serviceType: "PM",
    paymentMethod: "Cash",
    revenue: "125",
    comments: "PRIVATE INTERNAL NOTE",
    partNo: "PART-A",
    description: "Test roller",
    qty: "1",
    modelNo: "IR ADV TEST",
    serialNo: "TEST-SERIAL",
    copycount: "123456",
    arrivalTime: "08:30",
    departureTime: "10:15",
  });
  Object.assign(job.fields, {
    clientAddress: "123 Test Street, Port of Spain",
    phone: "555-0100",
    requesterName: "Test Requester",
    requesterEmail: "customer@example.test",
    scheduledDate: "2026-10-22",
    workRequired: "Service equipment",
    workCarriedOut:
      "Inspected, cleaned and tested the equipment. Café check passed. 🔧",
    otherPerformed: "Cleaned rollers",
    otherNeeded: "Review at next maintenance",
    startedDate: "2026-10-22",
    completedDate: "2026-10-22",
    completedByName: "Tech One",
    completedByDesignation: "Technician",
    approvedByName: "Test Customer",
    approvedByDesignation: "Office Manager",
    approvedDate: "2026-10-22",
  });
  job.signature = {
    strokes: [
      [
        [0.1, 0.2],
        [0.3, 0.7],
        [0.8, 0.3],
      ],
    ],
  };
  const arrival = formFields.find((field) => field.key === "arrivalTime");
  const departure = formFields.find((field) => field.key === "departureTime");
  assert(arrival && departure);
  const snapshot = customerSnapshot(job);
  assert.equal(formValue(snapshot, arrival), "8:30 AM");
  assert.equal(formValue(snapshot, departure), "10:15 AM");
  mkdirSync(".checks/field-pdf", { recursive: true });
  const charged = await customerPdf(customerSnapshot(job));
  writeFileSync(".checks/field-pdf/charged.pdf", charged);
  assert.equal((await PDFDocument.load(charged)).getPageCount(), 1);
  const free = structuredClone(job);
  free.line.paymentMethod = "No charge";
  free.line.revenue = "0";
  writeFileSync(
    ".checks/field-pdf/nocharge.pdf",
    await customerPdf(customerSnapshot(free)),
  );
  const long = structuredClone(job);
  long.fields.workCarriedOut = "Detailed inspection note. ".repeat(2000);
  long.fields.requesterName = "LongUnbrokenName".repeat(50);
  const overflow = await customerPdf(customerSnapshot(long));
  assert((await PDFDocument.load(overflow)).getPageCount() > 1);
  writeFileSync(".checks/field-pdf/overflow.pdf", overflow);
  const entry: WorkEntry = {
    ...job.line,
    reportId: "test",
    lineIndex: 0,
    monthLabel: "Oct 2026",
    workbookMonth: "2026-10",
    hours: 1.75,
    revenue: 125,
  };
  assert.equal(
    hasSupplementaryDetails({
      ...entry,
      revenue: 0,
      partNo: "",
      description: "",
      comments: "",
      paymentMethod: "No charge",
      ftf: "N/A",
    }),
    false,
  );
  assert.equal(
    hasSupplementaryDetails({ ...entry, revenue: 0, comments: "Service note" }),
    true,
  );
  assert.equal(
    monthlyEntries([entry, { ...entry, date: "2026-11-01" }], {
      month: "",
      from: "2026-10-22",
      to: "2026-11-01",
    }).length,
    2,
  );
  const management = await createMonthlyPdf(
    [
      entry,
      {
        ...entry,
        no: "2",
        customer: "ZERO-ONLY-CUSTOMER",
        revenue: 0,
        paymentMethod: "No charge",
        partNo: "",
        description: "",
        comments: "",
      },
      {
        ...entry,
        no: "3",
        customer: "P.O. CUSTOMER",
        revenue: 75,
        paymentMethod: "PO",
      },
    ],
    { month: "", from: "2026-10-01", to: "2026-11-30" },
  );
  writeFileSync(".checks/field-pdf/management.pdf", management);
  console.log(
    "Customer form and management PDF checks passed: six techs, one-page fit, overflow pages, revenue/notes/parts qualification and inclusive multi-month filtering.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
