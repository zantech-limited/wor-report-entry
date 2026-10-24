import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { customerPdf } from "../src/lib/customer-pdf";
import { customerSnapshot, emptyJob } from "../src/lib/field-model";
import { insertRecord } from "../src/lib/records";
import { createMonthlyPdf } from "../src/lib/report-pdf";
import {
  hasSupplementaryDetails,
  monthlyEntries,
} from "../src/lib/monthly-report";
import type { WorkEntry } from "../src/lib/model";
import { PDFDocument } from "pdf-lib";
import { formFields, formValue } from "../src/lib/form-layout";
function signatureStrokes(pdf: Uint8Array | Buffer) {
  const text = Buffer.from(pdf).toString("latin1");
  let strokes = 0;
  for (const match of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body = Buffer.from(match[1], "latin1");
    try {
      body = inflateSync(body);
    } catch {
      continue;
    }
    const source = body.toString("latin1");
    strokes += source.split("\n").filter((line) => line.startsWith("1.35 w")).length;
  }
  return strokes;
}

async function main() {
  process.env.DESK_ACCOUNTS_ENABLED = "false";
  process.env.APP_URL = process.env.APP_URL || "http://127.0.0.1:43123";
  mkdirSync(path.join(process.cwd(), ".checks"), { recursive: true });
  process.env.DATA_DIR = mkdtempSync(path.join(process.cwd(), ".checks/field-pdf-"));
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
  const unsigned = await customerPdf(customerSnapshot({ ...job, signature: undefined, technicianSignature: undefined }));
  assert.equal(signatureStrokes(unsigned), 0);
  assert.ok(signatureStrokes(charged) >= 2, "a saved signature is drawn on the form");
  const savedId = "00000000-0000-4000-8000-0000000000ab";
  const saved = emptyJob(savedId);
  saved.line.wor = "1042";
  saved.line.customer = "Caribbean Supplies";
  saved.line.date = "2026-10-24";
  await insertRecord("job", "local-legacy", saved, savedId);
  const open = structuredClone(saved);
  open.signature = job.signature;
  open.technicianSignature = {
    strokes: [
      [
        [0.15, 0.4],
        [0.45, 0.8],
        [0.8, 0.3],
      ],
    ],
  };
  const route = await import("../src/app/api/field/jobs/[id]/pdf/route");
  const origin = process.env.APP_URL;
  const preview = await route.POST(
    new Request(`${origin}/api/field/jobs/${savedId}/pdf`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ snapshot: customerSnapshot(open) }),
    }),
    { params: Promise.resolve({ id: savedId }) },
  );
  assert.equal(preview.status, 200);
  const previewBytes = Buffer.from(await preview.arrayBuffer());
  assert.equal(previewBytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(
    signatureStrokes(previewBytes) >= 4,
    "the open form's signatures are drawn even when the saved job has none",
  );
  const stored = await route.GET(
    new Request(`${origin}/api/field/jobs/${savedId}/pdf`, { headers: { origin } }),
    { params: Promise.resolve({ id: savedId }) },
  );
  assert.equal(stored.status, 200);
  assert.equal(signatureStrokes(Buffer.from(await stored.arrayBuffer())), 0);
  console.log(
    "Customer form and management PDF checks passed: six techs, one-page fit, overflow pages, revenue/notes/parts qualification and inclusive multi-month filtering.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
