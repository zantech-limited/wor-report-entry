import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { auth, currentActor } from "../src/lib/accounts";
import { database } from "../src/lib/storage";
import { emptyJob } from "../src/lib/field-model";
import { hashSnapshot, legacyHashSnapshot, saveFieldJob, visibleJobs } from "../src/lib/field-jobs";
import { getReport, getSuggestions } from "../src/lib/db";
import { formFields, formValue } from "../src/lib/form-layout";
import { formatClock12, formatStoredClock } from "../src/lib/clock-time";
import {
  contentDisposition,
  filenameFromDisposition,
  workOrderPdfFilename,
} from "../src/lib/pdf-name";
import { currentDeskMonth, deskMonthLabel, shiftDeskMonth } from "../src/lib/desk-month";
import { linkedTechnicianIdentities } from "../src/lib/technician-identity";
import { processMailQueue } from "../src/lib/mail-queue";
import { record, records, recordsWhere } from "../src/lib/records";
import { allowAttempt, forgetAttemptMemory, resetAttemptBuckets } from "../src/lib/attempt-limit";
import { withAccountMail } from "../src/lib/smtp";

async function main() {
  assert(process.env.DATA_DIR?.includes(".checks"), "Use an isolated .checks database.");
  assert.equal(shiftDeskMonth("2026-01", -1), "2025-12");
  assert.equal(shiftDeskMonth("2026-12", 1), "2027-01");
  assert.equal(deskMonthLabel("2026-10"), "October 2026");
  assert.equal(currentDeskMonth(new Date("2026-11-01T03:30:00Z")), "2026-10");
  assert.equal(currentDeskMonth(new Date("2026-11-01T04:30:00Z")), "2026-11");
  assert.equal(formatClock12(""), "");
  assert.equal(formatClock12("00:00"), "12:00 AM");
  assert.equal(formatClock12("08:30"), "8:30 AM");
  assert.equal(formatClock12("12:00"), "12:00 PM");
  assert.equal(formatClock12("13:05"), "1:05 PM");
  assert.equal(formatClock12("23:59"), "11:59 PM");
  assert.equal(formatClock12("not-a-time"), "not-a-time");
  assert.equal(formatStoredClock(12, 0, "AM"), "00:00");
  assert.equal(formatStoredClock(12, 0, "PM"), "12:00");
  assert.equal(formatStoredClock(1, 5, "PM"), "13:05");
  assert.equal(formatStoredClock(8, 30, "AM"), "08:30");
  assert.equal(formatStoredClock(0, 0, "AM"), "");
  const startedField = formFields.find((field) => field.key === "arrivalTime");
  assert(startedField);
  const timed = emptyJob("00000000-0000-4000-8000-000000000001");
  timed.line.arrivalTime = "15:45";
  assert.equal(formValue(timed, startedField), "3:45 PM");
  assert.equal(
    workOrderPdfFilename({
      wor: "1042",
      customer: "Caribbean Supplies",
      date: "2026-10-24",
    }),
    "1042 Caribbean Supplies 2026-10-24.pdf",
  );
  assert.equal(workOrderPdfFilename({}), "Work order.pdf");
  assert.equal(
    workOrderPdfFilename({ wor: "1042", customer: "Acme/East", date: "2026-10-24" }),
    "1042 Acme East 2026-10-24.pdf",
  );
  const disposition = contentDisposition("1042 Café 2026-10-24.pdf", true);
  assert.match(disposition, /^attachment;/);
  assert.match(disposition, /filename="1042 Caf_ 2026-10-24\.pdf"/);
  assert.match(
    disposition,
    /filename\*=UTF-8''1042%20Caf%C3%A9%202026-10-24\.pdf/,
  );
  assert.equal(filenameFromDisposition(disposition), "1042 Café 2026-10-24.pdf");
  assert.match(contentDisposition("Work order.pdf", false), /^inline;/);
  const techField = formFields.find((field) => field.label === "Technicians");
  assert(techField);
  const namedPreview = emptyJob("00000000-0000-4000-8000-000000000001");
  namedPreview.fields.completedByName = "Timothy Adams";
  assert.equal(formValue(namedPreview, techField), "Timothy Adams");
  const db = await database();
  await resetAttemptBuckets(["audit-window"]);
  assert.equal(await allowAttempt("audit-window", 2), true);
  assert.equal(await allowAttempt("audit-window", 2), true);
  forgetAttemptMemory();
  assert.equal(await allowAttempt("audit-window", 2), false);
  await db.query(
    "INSERT INTO desk_records (id,kind,owner_id,revision,data,updated_at) VALUES (?,?,?,1,?,?)",
    ["signed-a", "signed", "owner", JSON.stringify({ jobId: "job-a", signedAt: "2026-10-24T00:00:00.000Z" }), "2026-10-24T00:00:00.000Z"],
  );
  await db.query(
    "INSERT INTO desk_records (id,kind,owner_id,revision,data,updated_at) VALUES (?,?,?,1,?,?)",
    ["signed-b", "signed", "owner", JSON.stringify({ jobId: "job-b", signedAt: "2026-10-24T00:00:00.000Z" }), "2026-10-24T00:00:01.000Z"],
  );
  const matched = await recordsWhere<{ jobId: string }>("signed", "jobId", ["job-a"]);
  assert.deepEqual(matched.map((row) => row.id), ["signed-a"]);
  await (await getMigrations(auth().options)).runMigrations();
  await db.query("INSERT INTO meta (key,value) VALUES (?,?)", ["accounts-ready", "1"]);
  const created = await withAccountMail(() =>
    auth().api.signUpEmail({
      body: {
        name: "Timothy Adams",
        email: "timothy@example.test",
        password: "Local-test-password-12345",
      },
    }),
  );
  const verified = ["postgres", "supabase"].includes(db.config.engine) ? "true" : 1;
  const nameColumn = db.config.engine === "mysql" ? "`technicianName`" : '"technicianName"';
  await db.query(
    `UPDATE desk_user SET role = ?, status = ?, ${nameColumn} = ?, ${db.config.engine === "mysql" ? "`emailVerified`" : '"emailVerified"'} = ? WHERE id = ?`,
    ["admin", "active", "", verified, created.user.id],
  );
  const response = await withAccountMail(() =>
    auth().api.signInEmail({
      body: { email: "timothy@example.test", password: "Local-test-password-12345" },
      asResponse: true,
    }),
  );
  const actor = await currentActor(
    new Headers({
      cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; "),
    }),
  );
  assert(actor);
  assert.equal(actor.role, "admin");
  await getSuggestions();
  await db.query(
    "INSERT INTO suggestions (kind, parent, value, uses) VALUES ('tech', '', 'Timothy', 4)",
  );
  await db.query(
    "INSERT INTO technicians (name, active) VALUES ('Timothy', 0) ON CONFLICT(name) DO UPDATE SET active = 0",
  );
  const linked = await linkedTechnicianIdentities(db);
  assert.equal(linked.find((user) => user.id === actor.id)?.technician, "Timothy");
  assert((await getSuggestions()).techs.some((name) => name.toLowerCase() === "timothy"));
  const id = randomUUID();
  const job = emptyJob(id);
  Object.assign(job.line, {
    date: "2026-10-23",
    customer: "Shared draft customer",
    location: "Site A",
    arrivalTime: "08:00",
    departureTime: "09:00",
  });
  job.assignedIds = [actor.id];
  job.savedOn = "computer abcd";
  job.savedAt = "2026-10-23T12:00:00.000Z";
  const saved = await saveFieldJob(actor, id, job, 0, randomUUID(), false);
  assert.equal(saved.revision, 1);
  const seen = await visibleJobs(actor, "2026-10");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].data.savedOn, "computer abcd");
  assert.equal(seen[0].data.line.technician, "Timothy");
  await assert.rejects(
    saveFieldJob(actor, id, { ...job, savedOn: "phone efgh" }, 0, randomUUID(), false),
    /Conflict/,
  );
  const copyId = randomUUID();
  const copy = emptyJob(copyId);
  Object.assign(copy.line, { ...job.line, id: copyId, wor: "", customer: "Kept local copy" });
  copy.assignedIds = [actor.id];
  copy.savedOn = "phone efgh";
  copy.savedAt = "2026-10-23T12:05:00.000Z";
  await saveFieldJob(actor, copyId, copy, 0, randomUUID(), false);
  const both = await visibleJobs(actor, "2026-10");
  assert.equal(both.length, 2);
  assert(both.some((row) => row.data.line.customer === "Shared draft customer"));
  assert(both.some((row) => row.data.line.customer === "Kept local copy"));
  const signed = structuredClone((await record<typeof job>(id))!.data);
  Object.assign(signed.fields, {
    requesterEmail: "customer@example.test",
    workCarriedOut: "Serviced the unit",
    startedDate: "2026-10-23",
    completedDate: "2026-10-23",
    completedByName: "Timothy",
    approvedByName: "Customer",
    approvedDate: "2026-10-23",
  });
  signed.signature = { strokes: [[[0.1, 0.2], [0.4, 0.6], [0.7, 0.3]]] };
  signed.signedHash = hashSnapshot(signed);
  await saveFieldJob(actor, id, signed, 1, randomUUID(), true);
  await processMailQueue(10);
  const mail = (await records<{ state: string; lastError?: string }>("customer-mail"))[0];
  assert.equal(mail.data.state, "failed");
  assert.match(mail.data.lastError || "", /SMTP is not configured/);
  const namedId = randomUUID();
  const named = emptyJob(namedId);
  Object.assign(named.line, {
    date: "2026-10-23",
    customer: "Printed tech customer",
    location: "Site A",
    arrivalTime: "08:00",
    departureTime: "09:00",
    technician: "",
  });
  named.fields.completedByName = "Timothy Adams";
  named.assignedIds = [actor.id];
  await saveFieldJob(actor, namedId, named, 0, randomUUID(), false);
  const namedRow = (await record<typeof named>(namedId))!;
  assert.equal(namedRow.data.line.technician, "Timothy Adams");
  const workbook = await getReport(namedRow.data.reportId);
  assert.equal(
    workbook?.lines.find((line) => line.id === namedId)?.technician,
    "Timothy Adams",
  );
  const amended = structuredClone(signed);
  amended.line.comments = "Corrected internal note";
  await assert.rejects(
    saveFieldJob(actor, id, amended, 2, randomUUID(), false),
    /Describe the reason/,
  );
  amended.amendmentReason = "Correct the internal note";
  await saveFieldJob(actor, id, amended, 2, randomUUID(), false);
  const history = await records<{
    jobId: string;
    reason?: string;
    actorName?: string;
    at?: string;
  }>("job-history");
  const entry = history.find(
    (row) => row.data.jobId === id && row.data.reason === "Correct the internal note",
  );
  assert(entry);
  assert.equal(entry.data.actorName, "Timothy Adams");
  assert.match(entry.data.at || "", /^\d{4}-\d{2}-\d{2}T/);
  const amendedRow = (await record<typeof signed>(id))!;
  assert.equal(amendedRow.data.amendedBy, "Timothy Adams");
  assert.equal(amendedRow.data.line.technician, "Timothy");

  const reviewId = randomUUID();
  const review = emptyJob(reviewId);
  Object.assign(review.line, {
    date: "2026-10-22",
    customer: "John",
    location: "Site B",
    arrivalTime: "08:00",
    departureTime: "09:00",
    technician: "",
  });
  review.assignedIds = [actor.id];
  review.savedOn = "computer abcd";
  review.savedAt = "2026-10-22T15:00:00.000Z";
  const drafted = await saveFieldJob(actor, reviewId, review, 0, randomUUID(), false);
  const signing = structuredClone((await record<typeof review>(reviewId))!.data);
  signing.line.technician = "John";
  signing.line.secondaryTech = "Helper";
  delete signing.line.additionalTechs;
  Object.assign(signing.fields, {
    requesterEmail: "customer@example.test",
    workCarriedOut: "Serviced the unit",
    startedDate: "2026-10-22",
    completedDate: "2026-10-22",
    completedByName: "John",
    approvedByName: "Customer",
    approvedDate: "2026-10-22",
  });
  signing.signature = { strokes: [[[0.1, 0.2], [0.4, 0.6], [0.7, 0.3]]] };
  signing.savedAt = "2026-10-22T16:00:00.000Z";
  signing.signedHash = legacyHashSnapshot(signing);
  const submitted = await saveFieldJob(actor, reviewId, signing, drafted.revision, randomUUID(), true);
  const submittedRow = (await record<typeof review>(reviewId))!;
  assert.equal(submittedRow.data.state, "submitted");
  assert.equal(submittedRow.data.line.technician, "John");
  assert.equal(submittedRow.data.line.secondaryTech, "Helper");
  const noted = structuredClone(submittedRow.data);
  noted.line.comments = "Desk note that is not part of the signed preview";
  noted.savedAt = "2026-10-22T17:00:00.000Z";
  noted.savedOn = "phone wxyz";
  await assert.rejects(
    saveFieldJob(actor, reviewId, noted, submitted.revision, randomUUID(), true),
    /Describe the reason/,
  );
  noted.amendmentReason = "Record an internal note";
  const notedAck = await saveFieldJob(actor, reviewId, noted, submitted.revision, randomUUID(), true);
  assert.equal((await record<typeof review>(reviewId))!.data.line.customer, "John");
  const renamed = structuredClone((await record<typeof review>(reviewId))!.data);
  renamed.line.customer = "Jane";
  renamed.signature = { strokes: [[[0.2, 0.2], [0.5, 0.7], [0.8, 0.4]]] };
  renamed.amendmentReason = "Correct the customer";
  renamed.signedHash = noted.signedHash;
  await assert.rejects(
    saveFieldJob(actor, reviewId, renamed, notedAck.revision, randomUUID(), true),
    /signed preview changed/,
  );
  renamed.signedHash = hashSnapshot(renamed);
  await saveFieldJob(actor, reviewId, renamed, notedAck.revision, randomUUID(), true);
  const renamedRow = (await record<typeof review>(reviewId))!;
  assert.equal(renamedRow.data.line.customer, "Jane");
  assert.equal(renamedRow.data.line.technician, "John");

  const { debugDesk } = await import("../src/lib/debug-desk");
  const { rememberDeskEvent } = await import("../src/lib/desk-log");
  rememberDeskEvent("review", new Error("The signed preview changed. Review and sign this version again."));
  const debug = await debugDesk(actor, "ready");
  assert.equal(debug.account.role, "admin");
  assert.equal(debug.account.approval, "active");
  assert.equal(debug.account.name, "Timothy Adams");
  assert.equal(debug.mail.mode, "disabled");
  assert.equal(debug.mail.password, "missing");
  assert.equal(debug.mail.host, "missing");
  assert.ok(debug.mail.recent.some((row) => row.state === "failed" && /SMTP is not configured/.test(row.error || "")));
  assert.equal(JSON.stringify(debug.mail).includes("customer@example.test"), false);
  assert.equal(JSON.stringify(debug).includes("Local-test-password"), false);
  assert.equal(JSON.stringify(debug).includes(actor.email), false);
  assert.ok(debug.devices.some((row) => row.device === "computer abcd" && row.count >= 1));
  assert.ok(debug.events.some((row) => row.kind === "review" && /signed preview/.test(row.message) && row.reference.length === 8));
  assert.match(debug.serviceWorker, /zantech-shell-v066/);
  assert.equal(debug.template, "present");
  console.log("Shared drafts, technician history, and mail failure checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
