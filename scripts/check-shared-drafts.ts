import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { auth, currentActor } from "../src/lib/accounts";
import { database } from "../src/lib/storage";
import { emptyJob } from "../src/lib/field-model";
import { hashSnapshot, saveFieldJob, visibleJobs } from "../src/lib/field-jobs";
import { getReport, getSuggestions } from "../src/lib/db";
import { formFields, formValue } from "../src/lib/form-layout";
import { linkedTechnicianIdentities } from "../src/lib/technician-identity";
import { processMailQueue } from "../src/lib/mail-queue";
import { record, records } from "../src/lib/records";
import { withAccountMail } from "../src/lib/smtp";

async function main() {
  assert(process.env.DATA_DIR?.includes(".checks"), "Use an isolated .checks database.");
  const techField = formFields.find((field) => field.label === "Technicians");
  assert(techField);
  const namedPreview = emptyJob("00000000-0000-4000-8000-000000000001");
  namedPreview.fields.completedByName = "Timothy Adams";
  assert.equal(formValue(namedPreview, techField), "Timothy Adams");
  const db = await database();
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
  console.log("Shared drafts, technician history, and mail failure checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
